import { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment } from '@react-three/drei';
import * as THREE from 'three';

function RobotBody() {
  const groupRef = useRef<THREE.Group>(null);
  const leftLidRef = useRef<THREE.Mesh>(null);
  const rightLidRef = useRef<THREE.Mesh>(null);
  const blinkTarget = useRef(0); // 0 = open, 1 = closed

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.15;
    }
    // Smooth eyelid animation
    [leftLidRef, rightLidRef].forEach((ref) => {
      if (ref.current) {
        const target = blinkTarget.current;
        const current = ref.current.scale.y;
        ref.current.scale.y = THREE.MathUtils.lerp(current, target, delta * 25);
      }
    });
  });

  // Blink loop
  useEffect(() => {
    const blink = () => {
      blinkTarget.current = 1;
      setTimeout(() => { blinkTarget.current = 0; }, 120);
    };
    const id = setInterval(() => {
      blink();
    }, 14000);
    return () => clearInterval(id);
  }, []);

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
          {/* Left eye - darker iris */}
          <mesh position={[-0.14, 0.05, 0.33]}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.6} />
          </mesh>
          <mesh position={[-0.14, 0.05, 0.345]}>
            <sphereGeometry args={[0.03, 16, 16]} />
            <meshStandardMaterial color="#1565c0" emissive="#1565c0" emissiveIntensity={0.8} metalness={0.4} roughness={0.3} />
          </mesh>
          <mesh position={[-0.14, 0.05, 0.36]}>
            <sphereGeometry args={[0.015, 12, 12]} />
            <meshStandardMaterial color="#0a0a0a" metalness={0.1} roughness={0.9} />
          </mesh>
          {/* Left upper lash */}
          <mesh position={[-0.14, 0.09, 0.34]} rotation={[0.3, 0, 0]}>
            <boxGeometry args={[0.11, 0.015, 0.025]} />
            <meshStandardMaterial color="#222" metalness={0.2} roughness={0.8} />
          </mesh>
          {/* Left lower lash */}
          <mesh position={[-0.14, 0.01, 0.34]} rotation={[-0.2, 0, 0]}>
            <boxGeometry args={[0.09, 0.008, 0.02]} />
            <meshStandardMaterial color="#333" metalness={0.2} roughness={0.8} />
          </mesh>
          {/* Left eyelid - smooth animated */}
          <mesh ref={leftLidRef} position={[-0.14, 0.05, 0.37]} scale={[1, 0, 1]}>
            <boxGeometry args={[0.12, 0.12, 0.03]} />
            <meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} />
          </mesh>

          {/* Right eye - darker iris */}
          <mesh position={[0.14, 0.05, 0.33]}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.3} roughness={0.6} />
          </mesh>
          <mesh position={[0.14, 0.05, 0.345]}>
            <sphereGeometry args={[0.03, 16, 16]} />
            <meshStandardMaterial color="#1565c0" emissive="#1565c0" emissiveIntensity={0.8} metalness={0.4} roughness={0.3} />
          </mesh>
          <mesh position={[0.14, 0.05, 0.36]}>
            <sphereGeometry args={[0.015, 12, 12]} />
            <meshStandardMaterial color="#0a0a0a" metalness={0.1} roughness={0.9} />
          </mesh>
          {/* Right upper lash */}
          <mesh position={[0.14, 0.09, 0.34]} rotation={[0.3, 0, 0]}>
            <boxGeometry args={[0.11, 0.015, 0.025]} />
            <meshStandardMaterial color="#222" metalness={0.2} roughness={0.8} />
          </mesh>
          {/* Right lower lash */}
          <mesh position={[0.14, 0.01, 0.34]} rotation={[-0.2, 0, 0]}>
            <boxGeometry args={[0.09, 0.008, 0.02]} />
            <meshStandardMaterial color="#333" metalness={0.2} roughness={0.8} />
          </mesh>
          {/* Right eyelid - smooth animated */}
          <mesh ref={rightLidRef} position={[0.14, 0.05, 0.37]} scale={[1, 0, 1]}>
            <boxGeometry args={[0.12, 0.12, 0.03]} />
            <meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} />
          </mesh>

          {/* Upper lip */}
          <mesh position={[0, -0.11, 0.34]}>
            <boxGeometry args={[0.16, 0.025, 0.04]} />
            <meshStandardMaterial color="#8b4553" metalness={0.1} roughness={0.7} />
          </mesh>
          {/* Upper lip - cupid's bow center */}
          <mesh position={[0, -0.095, 0.35]}>
            <sphereGeometry args={[0.02, 12, 12]} />
            <meshStandardMaterial color="#8b4553" metalness={0.1} roughness={0.7} />
          </mesh>
          {/* Lower lip - slightly fuller */}
          <mesh position={[0, -0.14, 0.34]}>
            <boxGeometry args={[0.14, 0.03, 0.045]} />
            <meshStandardMaterial color="#9e5060" metalness={0.1} roughness={0.6} />
          </mesh>
          {/* Lip part line */}
          <mesh position={[0, -0.125, 0.365]}>
            <boxGeometry args={[0.13, 0.005, 0.01]} />
            <meshStandardMaterial color="#2a1015" metalness={0.1} roughness={0.9} />
          </mesh>
          {/* Smile curve - subtle upward corners */}
          <mesh position={[-0.08, -0.12, 0.345]}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshStandardMaterial color="#7a3d4a" metalness={0.1} roughness={0.7} />
          </mesh>
          <mesh position={[0.08, -0.12, 0.345]}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshStandardMaterial color="#7a3d4a" metalness={0.1} roughness={0.7} />
          </mesh>

          {/* Mustache */}
          <mesh position={[-0.06, -0.08, 0.34]} rotation={[0.1, 0, 0.25]}>
            <boxGeometry args={[0.12, 0.03, 0.03]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.15} roughness={0.9} />
          </mesh>
          <mesh position={[0.06, -0.08, 0.34]} rotation={[0.1, 0, -0.25]}>
            <boxGeometry args={[0.12, 0.03, 0.03]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.15} roughness={0.9} />
          </mesh>

          {/* Beard - chin area */}
          <mesh position={[0, -0.25, 0.25]}>
            <boxGeometry args={[0.32, 0.2, 0.2]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.15} roughness={0.9} />
          </mesh>
          {/* Beard - jaw sides */}
          <mesh position={[-0.2, -0.18, 0.18]}>
            <boxGeometry args={[0.12, 0.22, 0.18]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.15} roughness={0.9} />
          </mesh>
          <mesh position={[0.2, -0.18, 0.18]}>
            <boxGeometry args={[0.12, 0.22, 0.18]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.15} roughness={0.9} />
          </mesh>
          {/* Beard - chin point */}
          <mesh position={[0, -0.32, 0.22]}>
            <boxGeometry args={[0.2, 0.1, 0.15]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.15} roughness={0.9} />
          </mesh>
          {/* Antenna */}
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
    <div className="w-full h-[45vh] sm:h-[50vh] md:h-[55vh] bg-black rounded-lg">
      <Canvas
        camera={{ position: [0, 0.8, 6.5], fov: 36 }}
        gl={{ alpha: false, antialias: true }}
      >
        <color attach="background" args={['#000000']} />
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
