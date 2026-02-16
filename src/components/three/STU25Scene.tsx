import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text3D, Center, Float, Environment, MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';

function GlassText({ onLoaded }: { onLoaded?: () => void }) {
  const meshRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();
  const scale = Math.min(1, viewport.width / 8);
  const reportedRef = useRef(false);
  const frameCount = useRef(0);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.3) * 0.15;
      meshRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.2) * 0.05;
    }
    // Signal ready after a few frames have rendered (font is loaded by then)
    frameCount.current++;
    if (!reportedRef.current && frameCount.current > 10) {
      reportedRef.current = true;
      onLoaded?.();
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <group ref={meshRef} scale={scale}>
        <Center>
          <Text3D
            font="/fonts/inter-bold.json"
            size={1.4}
            height={0.5}
            bevelEnabled
            bevelThickness={0.03}
            bevelSize={0.02}
            bevelSegments={8}
            curveSegments={32}
            letterSpacing={0.05}
          >
            STU25
            <MeshTransmissionMaterial
              backside
              samples={16}
              thickness={0.4}
              chromaticAberration={0.15}
              anisotropy={0.3}
              distortion={0.1}
              distortionScale={0.2}
              temporalDistortion={0.1}
              roughness={0.05}
              ior={1.5}
              color="#ffffff"
              transmission={0.95}
              clearcoat={1}
              clearcoatRoughness={0}
              attenuationDistance={0.5}
              attenuationColor="#f0f0f0"
            />
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
  return (
    <Canvas
      camera={{ position: [0, 0, 10], fov: 35 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
      dpr={[1, 2]}
    >
      <Environment preset="city" />
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={0.5} />
      <directionalLight position={[-5, -3, -5]} intensity={0.2} />

      <GlassText onLoaded={onReady} />
      <OrbitalRing radius={3.2} speed={0.15} opacity={0.12} />
      <OrbitalRing radius={3.8} speed={-0.1} opacity={0.08} />
      <Particles />
    </Canvas>
  );
}
