import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment } from '@react-three/drei';
import * as THREE from 'three';

function RobotBody() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.12;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.15} floatIntensity={0.3}>
      <group ref={groupRef} position={[0, -1.0, 0]}>

        {/* ── Head ── */}
        <group position={[0, 2.55, 0]}>
          {/* Cranium - smooth sphere */}
          <mesh>
            <sphereGeometry args={[0.38, 32, 32]} />
            <meshStandardMaterial color="#d0d0d0" metalness={0.6} roughness={0.25} />
          </mesh>
          {/* Jaw / lower face - slightly narrower */}
          <mesh position={[0, -0.18, 0.02]}>
            <sphereGeometry args={[0.3, 32, 32]} />
            <meshStandardMaterial color="#c8c8c8" metalness={0.6} roughness={0.25} />
          </mesh>
          {/* Visor strip */}
          <mesh position={[0, 0.04, 0.34]}>
            <capsuleGeometry args={[0.06, 0.32, 8, 16]} rotation={[0, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={1.2} metalness={0.9} roughness={0.1} transparent opacity={0.9} />
          </mesh>
          {/* Left eye */}
          <mesh position={[-0.13, 0.06, 0.35]}>
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2.5} />
          </mesh>
          {/* Right eye */}
          <mesh position={[0.13, 0.06, 0.35]}>
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2.5} />
          </mesh>
          {/* Subtle mouth line */}
          <mesh position={[0, -0.14, 0.28]}>
            <boxGeometry args={[0.12, 0.015, 0.01]} />
            <meshStandardMaterial color="#999" metalness={0.5} roughness={0.4} />
          </mesh>
          {/* Ear panels */}
          <mesh position={[-0.37, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.08, 16]} />
            <meshStandardMaterial color="#aaa" metalness={0.7} roughness={0.2} />
          </mesh>
          <mesh position={[0.37, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.08, 16]} />
            <meshStandardMaterial color="#aaa" metalness={0.7} roughness={0.2} />
          </mesh>
          {/* Antenna nub */}
          <mesh position={[0, 0.4, 0]}>
            <sphereGeometry args={[0.035, 16, 16]} />
            <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={1.5} />
          </mesh>
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 8]} />
            <meshStandardMaterial color="#999" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>

        {/* ── Neck ── */}
        <mesh position={[0, 2.1, 0]}>
          <cylinderGeometry args={[0.1, 0.14, 0.2, 16]} />
          <meshStandardMaterial color="#bbb" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Neck ring detail */}
        <mesh position={[0, 2.03, 0]}>
          <torusGeometry args={[0.13, 0.02, 8, 24]} />
          <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* ── Torso / Suit Jacket ── */}
        <group position={[0, 1.35, 0]}>
          {/* Chest - tapered cylinder for more human shape */}
          <mesh>
            <cylinderGeometry args={[0.42, 0.48, 1.3, 16]} />
            <meshStandardMaterial color="#1a1a2e" metalness={0.25} roughness={0.75} />
          </mesh>
          {/* Shoulders - rounded */}
          <mesh position={[-0.5, 0.5, 0]}>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial color="#1a1a2e" metalness={0.25} roughness={0.75} />
          </mesh>
          <mesh position={[0.5, 0.5, 0]}>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial color="#1a1a2e" metalness={0.25} roughness={0.75} />
          </mesh>
          {/* Lapel left */}
          <mesh position={[-0.15, 0.3, 0.4]}>
            <boxGeometry args={[0.18, 0.45, 0.02]} />
            <meshStandardMaterial color="#22224a" metalness={0.3} roughness={0.6} />
          </mesh>
          {/* Lapel right */}
          <mesh position={[0.15, 0.3, 0.4]}>
            <boxGeometry args={[0.18, 0.45, 0.02]} />
            <meshStandardMaterial color="#22224a" metalness={0.3} roughness={0.6} />
          </mesh>
          {/* Shirt V */}
          <mesh position={[0, 0.25, 0.39]}>
            <boxGeometry args={[0.1, 0.5, 0.01]} />
            <meshStandardMaterial color="#f5f5f5" metalness={0.05} roughness={0.9} />
          </mesh>
          {/* Tie */}
          <mesh position={[0, 0.05, 0.41]}>
            <boxGeometry args={[0.07, 0.6, 0.015]} />
            <meshStandardMaterial color="#c1121f" metalness={0.15} roughness={0.5} />
          </mesh>
          {/* Tie knot */}
          <mesh position={[0, 0.38, 0.42]}>
            <sphereGeometry args={[0.04, 12, 12]} />
            <meshStandardMaterial color="#a01020" metalness={0.2} roughness={0.5} />
          </mesh>
          {/* Buttons */}
          {[-0.08, -0.25].map((y, i) => (
            <mesh key={i} position={[0, y, 0.43]}>
              <sphereGeometry args={[0.02, 12, 12]} />
              <meshStandardMaterial color="#555" metalness={0.8} roughness={0.2} />
            </mesh>
          ))}
          {/* Pocket square */}
          <mesh position={[-0.28, 0.35, 0.4]}>
            <boxGeometry args={[0.08, 0.06, 0.015]} />
            <meshStandardMaterial color="#f0f0f0" metalness={0.1} roughness={0.8} />
          </mesh>
        </group>

        {/* ── Left Arm ── */}
        <group position={[-0.65, 1.65, 0]}>
          {/* Upper arm */}
          <mesh position={[0, -0.2, 0]}>
            <capsuleGeometry args={[0.1, 0.4, 8, 16]} />
            <meshStandardMaterial color="#1a1a2e" metalness={0.25} roughness={0.75} />
          </mesh>
          {/* Elbow joint */}
          <mesh position={[0, -0.5, 0]}>
            <sphereGeometry args={[0.09, 16, 16]} />
            <meshStandardMaterial color="#aaa" metalness={0.7} roughness={0.2} />
          </mesh>
          {/* Forearm */}
          <mesh position={[0, -0.78, 0]}>
            <capsuleGeometry args={[0.08, 0.35, 8, 16]} />
            <meshStandardMaterial color="#1a1a2e" metalness={0.25} roughness={0.75} />
          </mesh>
          {/* Hand */}
          <mesh position={[0, -1.05, 0]}>
            <sphereGeometry args={[0.09, 16, 16]} />
            <meshStandardMaterial color="#c0c0c0" metalness={0.7} roughness={0.25} />
          </mesh>
          {/* Fingers hint */}
          {[-0.04, 0, 0.04].map((x, i) => (
            <mesh key={i} position={[x, -1.15, 0.02]}>
              <capsuleGeometry args={[0.018, 0.06, 4, 8]} />
              <meshStandardMaterial color="#b0b0b0" metalness={0.7} roughness={0.25} />
            </mesh>
          ))}
        </group>

        {/* ── Right Arm ── holding briefcase */}
        <group position={[0.65, 1.65, 0]} rotation={[0, 0, 0.04]}>
          <mesh position={[0, -0.2, 0]}>
            <capsuleGeometry args={[0.1, 0.4, 8, 16]} />
            <meshStandardMaterial color="#1a1a2e" metalness={0.25} roughness={0.75} />
          </mesh>
          <mesh position={[0, -0.5, 0]}>
            <sphereGeometry args={[0.09, 16, 16]} />
            <meshStandardMaterial color="#aaa" metalness={0.7} roughness={0.2} />
          </mesh>
          <mesh position={[0, -0.78, 0]}>
            <capsuleGeometry args={[0.08, 0.35, 8, 16]} />
            <meshStandardMaterial color="#1a1a2e" metalness={0.25} roughness={0.75} />
          </mesh>
          <mesh position={[0, -1.05, 0]}>
            <sphereGeometry args={[0.09, 16, 16]} />
            <meshStandardMaterial color="#c0c0c0" metalness={0.7} roughness={0.25} />
          </mesh>
          {/* Briefcase */}
          <group position={[0, -1.3, 0]}>
            <mesh>
              <boxGeometry args={[0.45, 0.32, 0.1]} />
              <meshStandardMaterial color="#3d1f08" metalness={0.25} roughness={0.6} />
            </mesh>
            {/* Leather edge */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.47, 0.34, 0.08]} />
              <meshStandardMaterial color="#4a2a10" metalness={0.2} roughness={0.7} transparent opacity={0.5} />
            </mesh>
            <mesh position={[0, 0.08, 0.055]}>
              <boxGeometry args={[0.06, 0.03, 0.015]} />
              <meshStandardMaterial color="#d4a843" metalness={0.9} roughness={0.1} />
            </mesh>
            <mesh position={[0, 0.2, 0]} rotation={[0, 0, 0]}>
              <torusGeometry args={[0.06, 0.012, 8, 16, Math.PI]} />
              <meshStandardMaterial color="#2a1505" metalness={0.4} roughness={0.5} />
            </mesh>
          </group>
        </group>

        {/* ── Belt ── */}
        <mesh position={[0, 0.68, 0]}>
          <torusGeometry args={[0.44, 0.025, 8, 24]} />
          <meshStandardMaterial color="#222" metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Belt buckle */}
        <mesh position={[0, 0.68, 0.44]}>
          <boxGeometry args={[0.06, 0.05, 0.015]} />
          <meshStandardMaterial color="#d4a843" metalness={0.9} roughness={0.1} />
        </mesh>

        {/* ── Legs ── */}
        {/* Left leg */}
        <group position={[-0.18, 0, 0]}>
          {/* Thigh */}
          <mesh position={[0, 0.25, 0]}>
            <capsuleGeometry args={[0.12, 0.4, 8, 16]} />
            <meshStandardMaterial color="#111125" metalness={0.25} roughness={0.75} />
          </mesh>
          {/* Knee */}
          <mesh position={[0, -0.05, 0]}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshStandardMaterial color="#999" metalness={0.7} roughness={0.25} />
          </mesh>
          {/* Shin */}
          <mesh position={[0, -0.35, 0]}>
            <capsuleGeometry args={[0.1, 0.35, 8, 16]} />
            <meshStandardMaterial color="#111125" metalness={0.25} roughness={0.75} />
          </mesh>
          {/* Shoe */}
          <mesh position={[0, -0.65, 0.06]}>
            <capsuleGeometry args={[0.08, 0.18, 8, 16]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
        {/* Right leg */}
        <group position={[0.18, 0, 0]}>
          <mesh position={[0, 0.25, 0]}>
            <capsuleGeometry args={[0.12, 0.4, 8, 16]} />
            <meshStandardMaterial color="#111125" metalness={0.25} roughness={0.75} />
          </mesh>
          <mesh position={[0, -0.05, 0]}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshStandardMaterial color="#999" metalness={0.7} roughness={0.25} />
          </mesh>
          <mesh position={[0, -0.35, 0]}>
            <capsuleGeometry args={[0.1, 0.35, 8, 16]} />
            <meshStandardMaterial color="#111125" metalness={0.25} roughness={0.75} />
          </mesh>
          <mesh position={[0, -0.65, 0.06]}>
            <capsuleGeometry args={[0.08, 0.18, 8, 16]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.4} roughness={0.5} />
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
        camera={{ position: [0, 1.2, 5.5], fov: 36 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} color="#ffffff" />
        <directionalLight position={[-2, 3, -2]} intensity={0.3} color="#00d4ff" />
        <pointLight position={[0, 3, 2]} intensity={0.4} color="#00d4ff" />
        <Environment preset="city" />
        <RobotBody />
      </Canvas>
    </div>
  );
}
