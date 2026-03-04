import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text3D, Center, Float, Environment, MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';

/* ── Stylised bald head built from primitives ── */
function GlassHead({ onLoaded }: { onLoaded?: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();
  const scale = Math.min(1, viewport.width / 8);
  const reportedRef = useRef(false);
  const frameCount = useRef(0);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.3) * 0.15;
      groupRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.2) * 0.05;
    }
    frameCount.current++;
    if (!reportedRef.current && frameCount.current > 10) {
      reportedRef.current = true;
      onLoaded?.();
    }
  });

  const transmissionProps = {
    backside: true,
    samples: 16,
    thickness: 0.4,
    chromaticAberration: 0.15,
    anisotropy: 0.3,
    distortion: 0.1,
    distortionScale: 0.2,
    temporalDistortion: 0.1,
    roughness: 0.05,
    ior: 1.5,
    color: '#ffffff',
    transmission: 0.95,
    clearcoat: 1,
    clearcoatRoughness: 0,
    attenuationDistance: 0.5,
    attenuationColor: '#f0f0f0',
  } as const;

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <group ref={groupRef} scale={scale}>
        {/* ── Cranium — slightly wider, flatter top ── */}
        <mesh position={[0, 0.3, 0]} scale={[1.05, 0.95, 1]}>
          <sphereGeometry args={[1.35, 64, 64]} />
          <MeshTransmissionMaterial {...transmissionProps} />
        </mesh>

        {/* ── Forehead — broader, more prominent brow ── */}
        <mesh position={[0, 0.55, 0.6]} scale={[1.1, 0.3, 0.45]}>
          <sphereGeometry args={[1, 32, 32]} />
          <MeshTransmissionMaterial {...transmissionProps} />
        </mesh>

        {/* ── Brow ridge — strong, defined ── */}
        <mesh position={[0, 0.15, 0.95]} scale={[0.85, 0.12, 0.2]}>
          <sphereGeometry args={[1, 24, 24]} />
          <MeshTransmissionMaterial {...transmissionProps} />
        </mesh>

        {/* ── Jaw — wider, stronger jawline ── */}
        <mesh position={[0, -0.65, 0.15]} scale={[1.05, 0.72, 0.9]}>
          <sphereGeometry args={[1, 48, 48]} />
          <MeshTransmissionMaterial {...transmissionProps} />
        </mesh>

        {/* ── Chin — rounder, fuller ── */}
        <mesh position={[0, -1.05, 0.35]} scale={[0.4, 0.25, 0.35]}>
          <sphereGeometry args={[1, 24, 24]} />
          <MeshTransmissionMaterial {...transmissionProps} />
        </mesh>

        {/* ── Cheekbones — higher, more prominent ── */}
        {[-1, 1].map((side) => (
          <mesh key={`cheek-${side}`} position={[side * 0.75, -0.15, 0.8]} scale={[0.35, 0.25, 0.3]}>
            <sphereGeometry args={[1, 24, 24]} />
            <MeshTransmissionMaterial {...transmissionProps} />
          </mesh>
        ))}

        {/* ── Nose — broader bridge, wider nostrils ── */}
        <mesh position={[0, -0.1, 1.05]} rotation={[0.25, 0, 0]} scale={[0.24, 0.35, 0.28]}>
          <sphereGeometry args={[1, 24, 24]} />
          <MeshTransmissionMaterial {...transmissionProps} />
        </mesh>

        {/* ── Nose tip — wider, rounder ── */}
        <mesh position={[0, -0.35, 1.18]} scale={[0.32, 0.2, 0.22]}>
          <sphereGeometry args={[1, 24, 24]} />
          <MeshTransmissionMaterial {...transmissionProps} />
        </mesh>

        {/* ── Nostrils / nose wings ── */}
        {[-1, 1].map((side) => (
          <mesh key={`nostril-${side}`} position={[side * 0.18, -0.38, 1.12]} scale={[0.12, 0.1, 0.1]}>
            <sphereGeometry args={[1, 16, 16]} />
            <MeshTransmissionMaterial {...transmissionProps} />
          </mesh>
        ))}

        {/* ── Fuller lips — top ── */}
        <mesh position={[0, -0.62, 1.0]} scale={[0.35, 0.08, 0.15]} rotation={[0.1, 0, 0]}>
          <sphereGeometry args={[1, 24, 24]} />
          <MeshTransmissionMaterial {...transmissionProps} />
        </mesh>
        {/* ── Fuller lips — bottom ── */}
        <mesh position={[0, -0.72, 0.97]} scale={[0.32, 0.1, 0.16]} rotation={[-0.1, 0, 0]}>
          <sphereGeometry args={[1, 24, 24]} />
          <MeshTransmissionMaterial {...transmissionProps} />
        </mesh>

        {/* ── Ears — closer to head ── */}
        {[-1, 1].map((side) => (
          <mesh key={`ear-${side}`} position={[side * 1.32, -0.15, -0.15]} rotation={[0, side * 0.25, 0]} scale={[0.18, 0.32, 0.14]}>
            <sphereGeometry args={[1, 24, 24]} />
            <MeshTransmissionMaterial {...transmissionProps} />
          </mesh>
        ))}

        {/* ══ Glasses ══ */}
        {/* Left lens frame */}
        <mesh position={[-0.48, 0.05, 1.1]}>
          <torusGeometry args={[0.38, 0.04, 16, 48]} />
          <meshStandardMaterial color="#888888" metalness={0.9} roughness={0.1} />
        </mesh>
        {/* Left lens (glass) */}
        <mesh position={[-0.48, 0.05, 1.1]}>
          <circleGeometry args={[0.34, 48]} />
          <MeshTransmissionMaterial
            {...transmissionProps}
            thickness={0.1}
            color="#aaccff"
            transmission={0.98}
          />
        </mesh>

        {/* Right lens frame */}
        <mesh position={[0.48, 0.05, 1.1]}>
          <torusGeometry args={[0.38, 0.04, 16, 48]} />
          <meshStandardMaterial color="#888888" metalness={0.9} roughness={0.1} />
        </mesh>
        {/* Right lens (glass) */}
        <mesh position={[0.48, 0.05, 1.1]}>
          <circleGeometry args={[0.34, 48]} />
          <MeshTransmissionMaterial
            {...transmissionProps}
            thickness={0.1}
            color="#aaccff"
            transmission={0.98}
          />
        </mesh>

        {/* Bridge between lenses */}
        <mesh position={[0, 0.12, 1.15]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.025, 0.025, 0.22, 12]} />
          <meshStandardMaterial color="#888888" metalness={0.9} roughness={0.1} />
        </mesh>

        {/* Left temple arm */}
        <mesh position={[-0.85, 0.05, 0.5]} rotation={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.025, 0.02, 1.4, 8]} />
          <meshStandardMaterial color="#888888" metalness={0.9} roughness={0.1} />
        </mesh>
        {/* Right temple arm */}
        <mesh position={[0.85, 0.05, 0.5]} rotation={[0, -0.45, 0]}>
          <cylinderGeometry args={[0.025, 0.02, 1.4, 8]} />
          <meshStandardMaterial color="#888888" metalness={0.9} roughness={0.1} />
        </mesh>

        {/* ── "WG" text below the head ── */}
        <Center position={[0, -2.2, 0]}>
          <Text3D
            font="/fonts/inter-bold.json"
            size={0.9}
            height={0.35}
            bevelEnabled
            bevelThickness={0.02}
            bevelSize={0.015}
            bevelSegments={6}
            curveSegments={32}
            letterSpacing={0.08}
          >
            WG
            <MeshTransmissionMaterial {...transmissionProps} />
          </Text3D>
        </Center>
      </group>
    </Float>
  );
}

function OrbitalRing({ radius, speed, opacity }: { radius: number; speed: number; opacity: number }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.x = Math.PI / 2 + Math.sin(clock.elapsedTime * speed * 0.5) * 0.3;
      ref.current.rotation.z = clock.elapsedTime * speed;
    }
  });

  return (
    <mesh ref={ref}>
      <torusGeometry args={[radius, 0.008, 16, 100]} />
      <meshStandardMaterial
        color="#ffffff"
        transparent
        opacity={opacity}
        emissive="#ffffff"
        emissiveIntensity={0.2}
      />
    </mesh>
  );
}

function Particles() {
  const count = 80;
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 12;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 8;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.02;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.015} color="#ffffff" transparent opacity={0.3} sizeAttenuation />
    </points>
  );
}

export default function STU25Scene({ onReady }: { onReady?: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 0, 10], fov: 35 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent', opacity: visible ? 1 : 0, transition: 'opacity 0.3s' }}
      dpr={[1, 2]}
      resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
    >
      <Environment preset="city" />
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={0.5} />
      <directionalLight position={[-5, -3, -5]} intensity={0.2} />

      <GlassHead onLoaded={onReady} />
      <OrbitalRing radius={3.2} speed={0.15} opacity={0.12} />
      <OrbitalRing radius={3.8} speed={-0.1} opacity={0.08} />
      <Particles />
    </Canvas>
  );
}
