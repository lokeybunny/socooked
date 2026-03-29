import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment } from '@react-three/drei';
import * as THREE from 'three';

function RobotBody() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.15;
    }
  });

  const suitColor = '#0a1a3a';
  const suitLight = '#0e2250';

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.4}>
      <group ref={groupRef} position={[0, -1.2, 0]}>
        {/* Head */}
        <group position={[0, 2.4, 0]}>
          <mesh>
            <boxGeometry args={[0.7, 0.75, 0.65]} />
            <meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.05, 0.33]}>
            <boxGeometry args={[0.55, 0.18, 0.02]} />
            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.5} metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[-0.14, 0.05, 0.34]}>
            <sphereGeometry args={[0.04, 16, 16]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
          </mesh>
          <mesh position={[0.14, 0.05, 0.34]}>
            <sphereGeometry args={[0.04, 16, 16]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.2, 8]} />
            <meshStandardMaterial color="#888" metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[0, 0.62, 0]}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={2} />
          </mesh>
        </group>

        {/* Neck */}
        <mesh position={[0, 1.95, 0]}>
          <cylinderGeometry args={[0.12, 0.15, 0.15, 8]} />
          <meshStandardMaterial color="#999" metalness={0.7} roughness={0.3} />
        </mesh>

        {/* Suit Jacket / Torso */}
        <group position={[0, 1.2, 0]}>
          <mesh>
            <boxGeometry args={[1.1, 1.3, 0.55]} />
            <meshStandardMaterial color={suitColor} metalness={0.3} roughness={0.7} />
          </mesh>
          <mesh position={[-0.2, 0.35, 0.28]}>
            <boxGeometry args={[0.25, 0.5, 0.02]} />
            <meshStandardMaterial color={suitLight} metalness={0.4} roughness={0.6} />
          </mesh>
          <mesh position={[0.2, 0.35, 0.28]}>
            <boxGeometry args={[0.25, 0.5, 0.02]} />
            <meshStandardMaterial color={suitLight} metalness={0.4} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.15, 0.29]}>
            <boxGeometry args={[0.1, 0.7, 0.02]} />
            <meshStandardMaterial color="#e63946" metalness={0.2} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.5, 0.3]}>
            <boxGeometry args={[0.14, 0.08, 0.03]} />
            <meshStandardMaterial color="#c1121f" metalness={0.2} roughness={0.5} />
          </mesh>
          {/* Shirt visible */}
          <mesh position={[0, 0.35, 0.275]}>
            <boxGeometry args={[0.15, 0.4, 0.01]} />
            <meshStandardMaterial color={suitColor} metalness={0.3} roughness={0.7} />
          </mesh>
          {/* Suit button 1 */}
          <mesh position={[0, -0.05, 0.29]}>
            <sphereGeometry args={[0.03, 12, 12]} />
            <meshStandardMaterial color={suitColor} metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Suit button 2 */}
          <mesh position={[0, -0.2, 0.29]}>
            <sphereGeometry args={[0.03, 12, 12]} />
            <meshStandardMaterial color={suitColor} metalness={0.8} roughness={0.2} />
          </mesh>
        </group>

        {/* Left Arm */}
        <group position={[-0.75, 1.2, 0]}>
          <mesh>
            <boxGeometry args={[0.3, 1.2, 0.35]} />
            <meshStandardMaterial color={suitColor} metalness={0.3} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.7, 0]}>
            <boxGeometry args={[0.22, 0.25, 0.2]} />
            <meshStandardMaterial color="#b0b0b0" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>

        {/* Right Arm */}
        <group position={[0.75, 1.2, 0]} rotation={[0, 0, 0.05]}>
          <mesh>
            <boxGeometry args={[0.3, 1.2, 0.35]} />
            <meshStandardMaterial color={suitColor} metalness={0.3} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.7, 0]}>
            <boxGeometry args={[0.22, 0.25, 0.2]} />
            <meshStandardMaterial color="#b0b0b0" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Briefcase */}
          <group position={[0, -1.05, 0]}>
            <mesh>
              <boxGeometry args={[0.5, 0.35, 0.12]} />
              <meshStandardMaterial color="#4a2c0a" metalness={0.3} roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.08, 0.065]}>
              <boxGeometry args={[0.08, 0.04, 0.02]} />
              <meshStandardMaterial color="#d4a843" metalness={0.9} roughness={0.1} />
            </mesh>
            <mesh position={[0, 0.22, 0]}>
              <torusGeometry args={[0.08, 0.015, 8, 16, Math.PI]} />
              <meshStandardMaterial color="#3a2008" metalness={0.4} roughness={0.5} />
            </mesh>
          </group>
        </group>

        {/* Left leg */}
        <group position={[-0.25, -0.15, 0]}>
          <mesh>
            <boxGeometry args={[0.4, 1.0, 0.4]} />
            <meshStandardMaterial color={suitColor} metalness={0.3} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.6, 0.05]}>
            <boxGeometry args={[0.35, 0.18, 0.5]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
        {/* Right leg */}
        <group position={[0.25, -0.15, 0]}>
          <mesh>
            <boxGeometry args={[0.4, 1.0, 0.4]} />
            <meshStandardMaterial color={suitColor} metalness={0.3} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.6, 0.05]}>
            <boxGeometry args={[0.35, 0.18, 0.5]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      </group>
    </Float>
  );
}

export default function InvestorRobot() {
  return (
    <div className="w-full h-[45vh] sm:h-[50vh] md:h-[55vh]">
      <Canvas
        camera={{ position: [0, 1, 5], fov: 40 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} color="#ffffff" />
        <directionalLight position={[-2, 3, -2]} intensity={0.4} color="#00e5ff" />
        <pointLight position={[0, 3, 2]} intensity={0.5} color="#00e5ff" />
        <Environment preset="city" />
        <RobotBody />
      </Canvas>
    </div>
  );
}
