import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text3D, Center, Float, Environment, MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Human head profile generated via LatheGeometry for a natural,
 * lightweight silhouette — no alien look.  Single mesh + glasses.
 */
function useHeadGeometry() {
  return useMemo(() => {
    // Profile curve (right half of head silhouette, rotated around Y)
    // Points go from top of skull down to neck, x = radius at that height
    const pts: THREE.Vector2[] = [
      // Top of skull
      new THREE.Vector2(0, 1.65),
      new THREE.Vector2(0.25, 1.62),
      new THREE.Vector2(0.55, 1.55),
      new THREE.Vector2(0.78, 1.42),
      new THREE.Vector2(0.95, 1.2),
      // Crown → forehead
      new THREE.Vector2(1.05, 1.0),
      new THREE.Vector2(1.08, 0.8),
      // Brow area — slight bump
      new THREE.Vector2(1.06, 0.6),
      new THREE.Vector2(1.02, 0.45),
      // Eye socket area — subtle indent
      new THREE.Vector2(0.96, 0.3),
      new THREE.Vector2(0.94, 0.15),
      // Cheekbone — wider
      new THREE.Vector2(1.0, 0.0),
      new THREE.Vector2(1.04, -0.15),
      // Mid-face
      new THREE.Vector2(1.0, -0.3),
      new THREE.Vector2(0.92, -0.45),
      // Mouth area
      new THREE.Vector2(0.82, -0.6),
      new THREE.Vector2(0.78, -0.72),
      // Chin — rounded
      new THREE.Vector2(0.7, -0.85),
      new THREE.Vector2(0.55, -0.98),
      new THREE.Vector2(0.38, -1.05),
      new THREE.Vector2(0.2, -1.08),
      new THREE.Vector2(0, -1.1),
      // Neck
      new THREE.Vector2(0, -1.1),
      new THREE.Vector2(0.48, -1.15),
      new THREE.Vector2(0.52, -1.35),
      new THREE.Vector2(0.5, -1.6),
      new THREE.Vector2(0.45, -1.8),
      new THREE.Vector2(0, -1.8),
    ];

    // Lathe around Y axis — 32 segments is smooth enough & lightweight
    const geo = new THREE.LatheGeometry(pts, 32, 0, Math.PI * 2);
    geo.computeVertexNormals();
    return geo;
  }, []);
}

function GlassHead({ onLoaded }: { onLoaded?: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();
  const scale = Math.min(1, viewport.width / 8);
  const reportedRef = useRef(false);
  const frameCount = useRef(0);
  const headGeo = useHeadGeometry();

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

  // Lighter transmission for performance — fewer samples
  const transmissionProps = {
    backside: true,
    samples: 8,
    thickness: 0.35,
    chromaticAberration: 0.12,
    anisotropy: 0.2,
    distortion: 0.08,
    distortionScale: 0.15,
    temporalDistortion: 0.08,
    roughness: 0.05,
    ior: 1.5,
    color: '#ffffff',
    transmission: 0.95,
    clearcoat: 1,
    clearcoatRoughness: 0,
    attenuationDistance: 0.5,
    attenuationColor: '#f0f0f0',
  } as const;

  const metalProps = { color: '#999999', metalness: 0.85, roughness: 0.15 } as const;

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <group ref={groupRef} scale={scale}>
        {/* ── Head — single lathe mesh ── */}
        <mesh geometry={headGeo} position={[0, 0.2, 0]}>
          <MeshTransmissionMaterial {...transmissionProps} />
        </mesh>

        {/* ══ Glasses ══ */}
        {/* Lens frames */}
        {[-1, 1].map((side) => (
          <group key={`lens-${side}`}>
            <mesh position={[side * 0.42, 0.35, 0.92]}>
              <torusGeometry args={[0.3, 0.035, 12, 32]} />
              <meshStandardMaterial {...metalProps} />
            </mesh>
            <mesh position={[side * 0.42, 0.35, 0.92]}>
              <circleGeometry args={[0.27, 32]} />
              <MeshTransmissionMaterial
                {...transmissionProps}
                thickness={0.08}
                color="#aaddff"
                transmission={0.98}
                samples={4}
              />
            </mesh>
          </group>
        ))}

        {/* Bridge */}
        <mesh position={[0, 0.4, 0.98]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.18, 8]} />
          <meshStandardMaterial {...metalProps} />
        </mesh>

        {/* Temple arms */}
        {[-1, 1].map((side) => (
          <mesh key={`arm-${side}`} position={[side * 0.72, 0.35, 0.45]} rotation={[0, side * 0.4, 0]}>
            <cylinderGeometry args={[0.02, 0.015, 1.1, 6]} />
            <meshStandardMaterial {...metalProps} />
          </mesh>
        ))}

        {/* ── "WG" text ── */}
        <Center position={[0, -2.0, 0]}>
          <Text3D
            font="/fonts/inter-bold.json"
            size={0.9}
            height={0.3}
            bevelEnabled
            bevelThickness={0.02}
            bevelSize={0.012}
            bevelSegments={4}
            curveSegments={24}
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
