const express = require('express');
const app = express();
app.use(express.json());

app.post('/api/estimate', (req, res) => {
  const { address, roofArea } = req.body;
  
  // This is a mock estimation. In a real app, you'd use actual APIs and calculations here.
  const mockEstimate = Math.round(Math.random() * 5000 + 2000); // Random number between 2000-7000
  
  res.json({ production: mockEstimate });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));