import React, { useState, useEffect, useRef } from 'react';
import { 
  ThemeProvider, createTheme, CssBaseline, 
  Container, Paper, Typography, Stepper, Step, StepLabel, 
  Button, TextField, Slider, Switch, FormControlLabel,
  Card, CardContent, Tooltip, Zoom, Fade, CircularProgress,
  IconButton
} from '@mui/material';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import InfoIcon from '@mui/icons-material/Info';

// Fix for default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Mock database of incentives
const incentivesDatabase = [
  { state: 'CA', type: 'rebate', amount: 1000, description: 'California Solar Initiative Rebate' },
  { state: 'CA', type: 'taxCredit', amount: 0.30, description: 'Federal Solar Investment Tax Credit' },
  { state: 'NY', type: 'rebate', amount: 5000, description: 'NY-Sun Incentive Program' },
  { state: 'NY', type: 'taxCredit', amount: 0.25, description: 'New York State Solar Equipment Tax Credit' },
  // Add more incentives for different states as needed
];

function AddressMap({ lat, lon }) {
  if (!lat || !lon) return null;

  return (
    <MapContainer center={[lat, lon]} zoom={13} style={{ height: '300px', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Marker position={[lat, lon]}>
        <Popup>
          Selected Address
        </Popup>
      </Marker>
    </MapContainer>
  );
}

function HistoricalWeatherChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={data}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis yAxisId="left" label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft' }} />
        <YAxis yAxisId="right" orientation="right" label={{ value: 'Solar Radiation (UV Index)', angle: 90, position: 'insideRight' }} />
        <RechartsTooltip />
        <Legend />
        <Line yAxisId="left" type="monotone" dataKey="temperature" stroke="#8884d8" activeDot={{ r: 8 }} />
        <Line yAxisId="right" type="monotone" dataKey="solarRadiation" stroke="#82ca9d" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function App() {
  const [address, setAddress] = useState('');
  const [roofArea, setRoofArea] = useState('');
  const [orientation, setOrientation] = useState(180);
  const [tilt, setTilt] = useState(20);
  const [annualConsumption, setAnnualConsumption] = useState('');
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [apiKeyAvailable, setApiKeyAvailable] = useState(true);
  const [monthlyData, setMonthlyData] = useState([]);
  const [weatherData, setWeatherData] = useState(null);
  const [costEstimate, setCostEstimate] = useState(null);
  const [mapCoordinates, setMapCoordinates] = useState(null);
  const [historicalWeather, setHistoricalWeather] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [darkMode, setDarkMode] = useState(false);
  const [incentives, setIncentives] = useState([]);
  const totalSteps = 3;
  const resultRef = useRef(null);

  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: {
        main: '#4CAF50',
      },
      secondary: {
        main: '#2196F3',
      },
    },
    transitions: {
      duration: {
        shortest: 150,
        shorter: 200,
        short: 250,
        standard: 300,
        complex: 375,
        enteringScreen: 225,
        leavingScreen: 195,
      },
    },
  });

  useEffect(() => {
    if (!process.env.REACT_APP_NREL_API_KEY || !process.env.REACT_APP_OPENWEATHER_API_KEY) {
      setApiKeyAvailable(false);
      setError('API key is not available. Please check your environment configuration.');
    }
  }, []);

  const findIncentives = (state) => {
    return incentivesDatabase.filter(incentive => incentive.state === state);
  };

  const calculateIncentives = (installationCost, state) => {
    const applicableIncentives = findIncentives(state);
    let totalIncentives = 0;
    const appliedIncentives = applicableIncentives.map(incentive => {
      let incentiveAmount;
      if (incentive.type === 'rebate') {
        incentiveAmount = incentive.amount;
      } else if (incentive.type === 'taxCredit') {
        incentiveAmount = installationCost * incentive.amount;
      }
      totalIncentives += incentiveAmount;
      return { ...incentive, appliedAmount: incentiveAmount };
    });
    return { appliedIncentives, totalIncentives };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!apiKeyAvailable) {
      setError('Cannot proceed without API keys.');
      return;
    }
    setLoading(true);
    setError('');
    setEstimate(null);
    setMonthlyData([]);
    setWeatherData(null);
    setCostEstimate(null);
    setMapCoordinates(null);
    setHistoricalWeather(null);
    setIncentives([]);

    try {
      const geocodeResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
      const geocodeData = await geocodeResponse.json();
      
      if (geocodeData.length === 0) {
        throw new Error('Unable to find coordinates for the given address');
      }

      const { lat, lon } = geocodeData[0];
      setMapCoordinates({ lat, lon });

      // Calculate system size based on annual consumption
      const averageSystemEfficiency = 0.75; // 75% system efficiency
      const averageSunHoursPerDay = 4; // Assume 4 peak sun hours per day on average
      const systemSizeKW = (parseFloat(annualConsumption) / 365 / averageSunHoursPerDay / averageSystemEfficiency);

      const nrelResponse = await fetch(`https://developer.nrel.gov/api/pvwatts/v6.json?api_key=${process.env.REACT_APP_NREL_API_KEY}&lat=${lat}&lon=${lon}&system_capacity=${systemSizeKW}&azimuth=${orientation}&tilt=${tilt}&array_type=1&module_type=1&losses=14`);
      const nrelData = await nrelResponse.json();

      if (nrelData.errors && nrelData.errors.length > 0) {
        throw new Error('Error fetching solar data: ' + nrelData.errors.join(', '));
      }

      const annualProduction = nrelData.outputs.ac_annual;
      
      // Estimate system cost and payback period
      const averageCostPerWatt = 2.77; // USD, based on 2021 average
      const estimatedCost = systemSizeKW * 1000 * averageCostPerWatt;

      const averageElectricityRate = 0.14; // USD per kWh, adjust based on location
      const annualSavings = annualProduction * averageElectricityRate;
      const paybackPeriod = annualSavings > 0 ? estimatedCost / annualSavings : Infinity;

      setEstimate(Math.round(annualProduction));

      // Calculate panel recommendation
      const panelWattage = 350; // Assuming 350W panels
      const recommendedPanels = Math.ceil(systemSizeKW * 1000 / panelWattage);

      // Calculate incentives
      const state = address.split(',').pop().trim(); // Assuming the state is the last part of the address
      const { appliedIncentives, totalIncentives } = calculateIncentives(estimatedCost, state);
      setIncentives(appliedIncentives);

      // Adjust cost estimate with incentives
      const adjustedCost = estimatedCost - totalIncentives;
      const adjustedPaybackPeriod = adjustedCost / annualSavings;

      // Prepare monthly data for the chart
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const chartData = nrelData.outputs.ac_monthly.map((value, index) => ({
        name: monthNames[index],
        production: Math.round(value)
      }));
      setMonthlyData(chartData);

      setCostEstimate({
        installationCost: Math.round(estimatedCost),
        adjustedInstallationCost: Math.round(adjustedCost),
        paybackPeriod: paybackPeriod === Infinity ? 'Infinity' : paybackPeriod.toFixed(1),
        adjustedPaybackPeriod: adjustedPaybackPeriod === Infinity ? 'Infinity' : adjustedPaybackPeriod.toFixed(1),
        annualSavings: Math.round(annualSavings),
        systemSizeKW: systemSizeKW.toFixed(2),
        recommendedPanels: recommendedPanels,
        recommendedSystemSize: systemSizeKW.toFixed(2),
        recommendedProduction: Math.round(annualProduction),
        totalIncentives: Math.round(totalIncentives),
      });

      // Fetch weather data
      try {
        const weatherResponse = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.REACT_APP_OPENWEATHER_API_KEY}&units=metric`);
        const weatherData = await weatherResponse.json();

        if (weatherData.main && weatherData.weather && weatherData.weather.length > 0 && weatherData.clouds) {
          setWeatherData({
            temperature: weatherData.main.temp,
            description: weatherData.weather[0].description,
            cloudCover: weatherData.clouds.all
          });
        } else {
          console.error('Unexpected weather data format:', weatherData);
          setWeatherData(null);
        }
      } catch (weatherError) {
        console.error('Error fetching weather data:', weatherError);
        setWeatherData(null);
      }

      // Fetch historical weather data
      try {
        const historicalResponse = await fetch(`https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=current,minutely,hourly,alerts&appid=${process.env.REACT_APP_OPENWEATHER_API_KEY}&units=metric`);
        const historicalData = await historicalResponse.json();

        if (historicalData.daily) {
          const processedHistoricalData = processHistoricalWeatherData(historicalData.daily);
          setHistoricalWeather(processedHistoricalData);
        } else {
          console.error('Unexpected historical weather data format:', historicalData);
          setHistoricalWeather(null);
        }
      } catch (historicalError) {
        console.error('Error fetching historical weather data:', historicalError);
        setHistoricalWeather(null);
      }

    } catch (err) {
      setError(err.message || 'Failed to estimate solar production. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const processHistoricalWeatherData = (dailyData) => {
    const monthlyData = Array(12).fill().map(() => ({ temperature: 0, solarRadiation: 0, count: 0 }));
    
    dailyData.forEach(day => {
      const date = new Date(day.dt * 1000);
      const month = date.getMonth();
      monthlyData[month].temperature += day.temp.day;
      monthlyData[month].solarRadiation += day.uvi; // Using UV index as a proxy for solar radiation
      monthlyData[month].count++;
    });

    return monthlyData.map((month, index) => ({
      month: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index],
      temperature: month.count > 0 ? (month.temperature / month.count).toFixed(1) : 0,
      solarRadiation: month.count > 0 ? (month.solarRadiation / month.count).toFixed(1) : 0,
    }));
  };

  const generatePDF = async () => {
    const content = resultRef.current;
    const canvas = await html2canvas(content);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF();
    pdf.addImage(imgData, 'PNG', 0, 0);
    pdf.save("solar_estimation_report.pdf");
  };

  const shareViaEmail = () => {
    const subject = "Solar Estimation Results";
    const body = `
      Estimated Annual Solar Production: ${estimate} kWh
      Recommended System Size: ${costEstimate?.recommendedSystemSize} kW
      Recommended Number of Panels: ${costEstimate?.recommendedPanels}
      Estimated Installation Cost: $${costEstimate?.installationCost



      }
      Adjusted Installation Cost (after incentives): $${costEstimate?.adjustedInstallationCost}
      Estimated Annual Savings: $${costEstimate?.annualSavings}
      Estimated Payback Period: ${costEstimate?.paybackPeriod === 'Infinity' ? 'N/A (no savings calculated)' : `${costEstimate?.paybackPeriod} years`}
      Adjusted Payback Period (with incentives): ${costEstimate?.adjustedPaybackPeriod === 'Infinity' ? 'N/A (no savings calculated)' : `${costEstimate?.adjustedPaybackPeriod} years`}
      Total Available Incentives: $${costEstimate?.totalIncentives}
      
      Note: This is a rough estimate. Please consult with a solar professional for more accurate figures.
    `;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const steps = ['Location', 'System Details', 'Review'];

  const renderStep = () => {
    switch(currentStep) {
      case 1:
        return (
          <Fade in={true}>
            <TextField
              fullWidth
              label="Building Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              margin="normal"
              helperText="Enter the full address of the building where you want to install solar panels"
            />
          </Fade>
        );
      case 2:
        return (
          <Fade in={true}>
            <div>
              <TextField
                fullWidth
                label="Annual Energy Consumption (kWh)"
                type="number"
                value={annualConsumption}
                onChange={(e) => setAnnualConsumption(e.target.value)}
                required
                margin="normal"
                helperText="Enter your total annual energy consumption in kilowatt-hours"
              />
              <TextField
                fullWidth
                label="Roof Area (m²)"
                type="number"
                value={roofArea}
                onChange={(e) => setRoofArea(e.target.value)}
                required
                margin="normal"
                helperText="Enter the total area of your roof in square meters"
              />
              <Typography gutterBottom>Roof Orientation: {orientation}°</Typography>
              <Slider
                value={orientation}
                onChange={(e, newValue) => setOrientation(newValue)}
                min={0}
                max={359}
                step={1}
                marks={[
                  { value: 0, label: 'N' },
                  { value: 90, label: 'E' },
                  { value: 180, label: 'S' },
                  { value: 270, label: 'W' },
                ]}
              />
              <Typography gutterBottom>Roof Tilt: {tilt}°</Typography>
              <Slider
                value={tilt}
                onChange={(e, newValue) => setTilt(newValue)}
                min={0}
                max={90}
                step={1}
                marks={[
                  { value: 0, label: 'Flat' },
                  { value: 45, label: 'Steep' },
                  { value: 90, label: 'Vertical' },
                ]}
              />
            </div>
          </Fade>
        );
      case 3:
        return (
          <Fade in={true}>
            <div>
              <Typography variant="h6">Review Your Inputs</Typography>
              <Typography>Address: {address}</Typography>
              <Typography>Annual Energy Consumption: {annualConsumption} kWh</Typography>
              <Typography>Roof Area: {roofArea} m²</Typography>
              <Typography>Roof Orientation: {orientation}°</Typography>
              <Typography>Roof Tilt: {tilt}°</Typography>
            </div>
          </Fade>
        );
      default:
        return null;
    }
  };

  if (!apiKeyAvailable) {
    return <Typography color="error">Error: API keys are not available. Please check your environment configuration.</Typography>;
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="md">
        <Paper elevation={3} style={{ padding: '20px', marginTop: '20px' }}>
          <Typography variant="h4" gutterBottom>Solar Production Estimator</Typography>
          <FormControlLabel
            control={<Switch checked={darkMode} onChange={() => setDarkMode(!darkMode)} />}
            label="Dark Mode"
          />
          <Stepper activeStep={currentStep - 1} alternativeLabel style={{ marginTop: '20px' }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
          <form onSubmit={handleSubmit} style={{ marginTop: '20px' }}>
            {renderStep()}
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
              {currentStep > 1 && (
                <Button onClick={() => setCurrentStep(step => step - 1)}>
                  Previous
                </Button>
              )}
              {currentStep < totalSteps ? (
                <Button variant="contained" color="primary" onClick={() => setCurrentStep(step => step + 1)}>
                  Next
                </Button>
              ) : (
                <Button variant="contained" color="primary" type="submit" disabled={loading}>
                  {loading ? <CircularProgress size={24} /> : 'Get Solar Estimate'}
                </Button>
              )}
            </div>
          </form>
          {error && (
            <Zoom in={true}>
              <Typography color="error" style={{ marginTop: '20px' }}>{error}</Typography>
            </Zoom>
          )}
          {estimate !== null && (
            <Fade in={true}>
              <Card ref={resultRef} style={{ marginTop: '20px' }}>
                <CardContent>
                  <Typography variant="h5" gutterBottom>Solar Estimation Results</Typography>
                  <Typography variant="h6" color="primary">
                    Estimated Annual Solar Production: {estimate} kWh
                    <Tooltip title="This is the total amount of electricity your solar panels are expected to generate in a year">
                      <IconButton size="small">
                        <InfoIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Typography>
                  <div style={{ height: '300px', marginTop: '20px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <RechartsTooltip />
                        <Legend />
                        <Bar dataKey="production" fill="#8884d8" name="Monthly Production (kWh)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {mapCoordinates && (
                    <div style={{ marginTop: '20px' }}>
                      <Typography variant="h6">Location Map</Typography>
                      <AddressMap lat={mapCoordinates.lat} lon={mapCoordinates.lon} />
                    </div>
                  )}
                  {weatherData && (
                    <Card style={{ marginTop: '20px' }}>
                      <CardContent>
                        <Typography variant="h6">Current Weather Conditions</Typography>
                        <Typography>Temperature: {weatherData.temperature}°C</Typography>
                        <Typography>Conditions: {weatherData.description}</Typography>
                        <Typography>Cloud Cover: {weatherData.cloudCover}%</Typography>
                      </CardContent>
                    </Card>
                  )}
                  {costEstimate && (
                    <Card style={{ marginTop: '20px' }}>
                      <CardContent>
                        <Typography variant="h6">System Recommendations and Cost Analysis</Typography>
                        <Typography>Recommended System Size: {costEstimate.recommendedSystemSize} kW</Typography>
                        <Typography>Number of Panels: {costEstimate.recommendedPanels}</Typography>
                        <Typography>Estimated Installation Cost: ${costEstimate.installationCost}</Typography>
                        <Typography>Total Available Incentives: ${costEstimate.totalIncentives}</Typography>
                        <Typography>Adjusted Installation Cost: ${costEstimate.adjustedInstallationCost}</Typography>
                        <Typography>Estimated Annual Savings: ${costEstimate.annualSavings}</Typography>
                        <Typography>
                          Estimated Payback Period (without incentives): {
                            costEstimate.paybackPeriod === 'Infinity' 
                              ? 'N/A (no savings calculated)' 
                              : `${costEstimate.paybackPeriod} years`
                          }
                        </Typography>
                        <Typography>
                          Adjusted Payback Period (with incentives): {
                            costEstimate.adjustedPaybackPeriod === 'Infinity' 
                              ? 'N/A (no savings calculated)' 
                              : `${costEstimate.adjustedPaybackPeriod} years`
                          }
                        </Typography>
                      </CardContent>
                    </Card>
                  )}
                  {incentives.length > 0 && (
                    <Card style={{ marginTop: '20px' }}>
                      <CardContent>
                        <Typography variant="h6">Available Incentives</Typography>
                        {incentives.map((incentive, index) => (
                          <Typography key={index}>
                            {incentive.description}: ${Math.round(incentive.appliedAmount)}
                          </Typography>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                  {historicalWeather && (
                    <div style={{ marginTop: '20px' }}>
                      <Typography variant="h6">Historical Weather Data</Typography>
                      <HistoricalWeatherChart data={historicalWeather} />
                    </div>
                  )}
                  <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
                    <Button variant="contained" color="secondary" onClick={generatePDF}>
                      Export as PDF
                    </Button>
                    <Button variant="contained" color="secondary" onClick={shareViaEmail}>
                      Share via Email
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Fade>
          )}
        </Paper>
      </Container>
    </ThemeProvider>
  );
}

export default App;