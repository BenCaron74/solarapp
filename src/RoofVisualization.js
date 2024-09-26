import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

function Roof({ width, length, tilt, orientation }) {
  const mesh = useRef();

  useFrame(() => {
    if (mesh.current) {
      mesh.current.rotation.y = orientation * (Math.PI / 180);
    }
  });

  const height = Math.sin(tilt * (Math.PI / 180)) * length;

  return (
    <mesh ref={mesh}>
      <boxGeometry args={[width, height, length]} />
      <meshStandardMaterial color="gray" />
    </mesh>
  );
}

function SolarPanel({ position }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[1, 0.1, 1.6]} />
      <meshStandardMaterial color="blue" />
    </mesh>
  );
}

export function RoofVisualization({ width, length, tilt, orientation, panelCount }) {
  const panelsPerRow = Math.floor(width / 1.2);
  const rows = Math.floor(panelCount / panelsPerRow);

  return (
    <Canvas style={{ height: '400px' }}>
      <ambientLight intensity={0.5} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
      <Roof width={width} length={length} tilt={tilt} orientation={orientation} />
      {Array.from({ length: rows }).map((_, rowIndex) =>
        Array.from({ length: panelsPerRow }).map((_, colIndex) => (
          <SolarPanel
            key={`${rowIndex}-${colIndex}`}
            position={[
              (colIndex - panelsPerRow / 2 + 0.5) * 1.2,
              0.1,
              (rowIndex - rows / 2 + 0.5) * 1.8,
            ]}
          />
        ))
      )}
      <OrbitControls />
    </Canvas>
  );
}