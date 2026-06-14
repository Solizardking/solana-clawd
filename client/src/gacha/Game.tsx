import { Float, OrbitControls, Sparkles, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

const shellMaterial = new THREE.MeshStandardMaterial({
  color: '#ff4d3f',
  roughness: 0.48,
  metalness: 0.18,
});

const deepShellMaterial = new THREE.MeshStandardMaterial({
  color: '#a81526',
  roughness: 0.6,
  metalness: 0.12,
});

const creamMaterial = new THREE.MeshStandardMaterial({
  color: '#ffe0b8',
  roughness: 0.72,
  metalness: 0.04,
});

const cyanMaterial = new THREE.MeshStandardMaterial({
  color: '#42f2ff',
  emissive: '#0a8d99',
  emissiveIntensity: 0.85,
  roughness: 0.35,
  metalness: 0.25,
});

const inkMaterial = new THREE.MeshStandardMaterial({
  color: '#071016',
  roughness: 0.5,
});

type ClawProps = {
  side: -1 | 1;
};

const Claw = ({ side }: ClawProps) => {
  const clawRef = useRef<THREE.Group>(null);
  const upperPincherRef = useRef<THREE.Mesh>(null);
  const lowerPincherRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    const pulse = Math.sin(elapsed * 2.4 + side * 0.7);

    if (clawRef.current) {
      clawRef.current.rotation.z = side * (0.44 + pulse * 0.07);
      clawRef.current.position.y = 0.15 + pulse * 0.05;
    }

    if (upperPincherRef.current) {
      upperPincherRef.current.rotation.z = side * (0.52 + pulse * 0.18);
    }

    if (lowerPincherRef.current) {
      lowerPincherRef.current.rotation.z = side * (-0.5 - pulse * 0.14);
    }
  });

  return (
    <group ref={clawRef} position={[side * 1.45, 0.18, 0]} rotation={[0, 0, side * 0.5]}>
      <mesh
        castShadow
        material={deepShellMaterial}
        position={[side * 0.24, -0.05, 0]}
        rotation={[0, 0, side * 0.22]}
      >
        <capsuleGeometry args={[0.13, 1.1, 8, 18]} />
      </mesh>
      <mesh
        castShadow
        material={shellMaterial}
        position={[side * 0.78, 0.18, 0]}
        scale={[0.55, 0.36, 0.26]}
      >
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      <mesh
        ref={upperPincherRef}
        castShadow
        material={shellMaterial}
        position={[side * 1.15, 0.33, 0]}
        rotation={[0, 0, side * 0.55]}
        scale={[0.55, 0.13, 0.18]}
      >
        <capsuleGeometry args={[0.42, 0.52, 8, 16]} />
      </mesh>
      <mesh
        ref={lowerPincherRef}
        castShadow
        material={shellMaterial}
        position={[side * 1.14, 0.06, 0]}
        rotation={[0, 0, side * -0.55]}
        scale={[0.48, 0.12, 0.16]}
      >
        <capsuleGeometry args={[0.38, 0.5, 8, 16]} />
      </mesh>
    </group>
  );
};

const LobsterRig = () => {
  const rigRef = useRef<THREE.Group>(null);
  const whiskerRefs = useRef<THREE.Mesh[]>([]);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();

    if (rigRef.current) {
      rigRef.current.rotation.y = Math.sin(elapsed * 0.55) * 0.18;
      rigRef.current.position.y = Math.sin(elapsed * 1.2) * 0.08;
    }

    whiskerRefs.current.forEach((whisker, index) => {
      whisker.rotation.z =
        (index < 2 ? -1 : 1) * (0.35 + Math.sin(elapsed * 1.8 + index) * 0.08);
    });
  });

  const tailSegments = useMemo(
    () =>
      Array.from({ length: 5 }, (_, index) => ({
        x: 0,
        y: -0.64 - index * 0.3,
        z: -0.05,
        scale: 1 - index * 0.09,
      })),
    [],
  );

  return (
    <Float floatIntensity={0.35} rotationIntensity={0.08} speed={1.4}>
      <group ref={rigRef} position={[0, -0.35, 0]} rotation={[0.15, 0, 0]}>
        <mesh castShadow receiveShadow material={shellMaterial} scale={[0.85, 1.15, 0.48]}>
          <sphereGeometry args={[1, 36, 22]} />
        </mesh>

        <mesh castShadow material={deepShellMaterial} position={[0, 0.72, 0]} scale={[0.64, 0.48, 0.38]}>
          <sphereGeometry args={[1, 32, 18]} />
        </mesh>

        {tailSegments.map((segment, index) => (
          <mesh
            key={index}
            castShadow
            material={index % 2 === 0 ? deepShellMaterial : shellMaterial}
            position={[segment.x, segment.y, segment.z]}
            scale={[0.68 * segment.scale, 0.22, 0.38 * segment.scale]}
          >
            <sphereGeometry args={[1, 24, 12]} />
          </mesh>
        ))}

        <mesh material={creamMaterial} position={[0, -2.18, -0.02]} scale={[0.88, 0.18, 0.08]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>

        <Claw side={-1} />
        <Claw side={1} />

        {[-0.42, 0.42].map((x) => (
          <group key={x} position={[x, 0.98, 0.28]}>
            <mesh castShadow material={creamMaterial} scale={[0.12, 0.18, 0.12]}>
              <sphereGeometry args={[1, 16, 10]} />
            </mesh>
            <mesh material={cyanMaterial} position={[0, 0.03, 0.08]} scale={[0.055, 0.055, 0.055]}>
              <sphereGeometry args={[1, 12, 8]} />
            </mesh>
          </group>
        ))}

        {[-0.36, -0.18, 0.18, 0.36].map((x, index) => (
          <mesh
            key={x}
            ref={(node) => {
              if (node) whiskerRefs.current[index] = node;
            }}
            material={inkMaterial}
            position={[x, 1.04, 0.05]}
            rotation={[0.15, 0, x < 0 ? -0.38 : 0.38]}
            scale={[0.018, 0.92, 0.018]}
          >
            <capsuleGeometry args={[1, 1, 6, 8]} />
          </mesh>
        ))}
      </group>
    </Float>
  );
};

const DataRing = () => {
  const ringRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.rotation.z = clock.getElapsedTime() * 0.18;
    }
  });

  return (
    <group ref={ringRef} position={[0, -0.18, -0.55]}>
      <mesh>
        <torusGeometry args={[2.82, 0.015, 8, 128]} />
        <meshStandardMaterial color="#42f2ff" emissive="#096c7a" emissiveIntensity={1.3} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <torusGeometry args={[3.16, 0.01, 8, 96]} />
        <meshStandardMaterial color="#ff5b4f" emissive="#7d101b" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
};

const CapsuleMachine = () => {
  const rotorRef = useRef<THREE.Group>(null);
  const chuteRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (rotorRef.current) {
      rotorRef.current.rotation.z = elapsed * 0.42;
    }
    if (chuteRef.current) {
      chuteRef.current.position.y = -1.85 + Math.sin(elapsed * 2.1) * 0.06;
    }
  });

  const capsuleColors = ['#72f6ff', '#ff5b4f', '#ffe0b8', '#8ee7b3', '#9945ff'];

  return (
    <group position={[0, -0.25, -1.45]}>
      <mesh receiveShadow position={[0, -2.58, 0]} scale={[2.35, 0.28, 0.92]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#071016" metalness={0.45} roughness={0.32} />
      </mesh>

      <mesh receiveShadow position={[0, -1.28, 0]} scale={[1.88, 1.84, 0.36]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#10222a" metalness={0.28} roughness={0.46} />
      </mesh>

      <mesh position={[0, 0.36, 0]} scale={[1.52, 1.52, 0.34]}>
        <sphereGeometry args={[1, 48, 24]} />
        <meshPhysicalMaterial
          color="#c8fbff"
          transparent
          opacity={0.2}
          roughness={0.05}
          metalness={0.05}
          transmission={0.42}
        />
      </mesh>

      <group ref={rotorRef} position={[0, 0.36, 0.02]}>
        {capsuleColors.map((color, index) => {
          const angle = (index / capsuleColors.length) * Math.PI * 2;
          return (
            <mesh
              key={color}
              castShadow
              position={[Math.cos(angle) * 0.82, Math.sin(angle) * 0.56, 0.12]}
              rotation={[0.25, 0, angle]}
              scale={[0.24, 0.34, 0.24]}
            >
              <sphereGeometry args={[1, 24, 14]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.16}
                metalness={0.12}
                roughness={0.38}
              />
            </mesh>
          );
        })}
      </group>

      <mesh ref={chuteRef} castShadow position={[0, -1.85, 0.36]} scale={[0.58, 0.32, 0.34]}>
        <sphereGeometry args={[1, 28, 16]} />
        <meshStandardMaterial
          color="#72f6ff"
          emissive="#096c7a"
          emissiveIntensity={0.45}
          roughness={0.32}
          metalness={0.2}
        />
      </mesh>

      <Text
        color="#72f6ff"
        anchorX="center"
        anchorY="middle"
        font="./fonts/Nunito-Black.ttf"
        fontSize={0.14}
        position={[0, -1.18, 0.42]}
      >
        PULL 20
      </Text>
    </group>
  );
};

const Game = () => {
  return (
    <>
      <color args={['#061018']} attach="background" />
      <ambientLight intensity={0.65} />
      <directionalLight castShadow intensity={2.2} position={[4, 5, 5]} />
      <pointLight color="#42f2ff" intensity={2.8} position={[-3, 1.2, 2.8]} />
      <pointLight color="#ff5b4f" intensity={2.2} position={[3, -1, 2.2]} />
      <Sparkles count={90} scale={[7, 3.5, 3]} size={2.4} speed={0.35} color="#72f6ff" />
      <DataRing />
      <CapsuleMachine />
      <LobsterRig />
      <Text
        color="#eaffff"
        anchorX="center"
        anchorY="middle"
        font="./fonts/Nunito-Black.ttf"
        fontSize={0.22}
        position={[0, -3.05, 0.2]}
      >
        LOBSTER GACHA
      </Text>
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        maxPolarAngle={Math.PI * 0.64}
        minPolarAngle={Math.PI * 0.32}
      />
    </>
  );
};

export default Game;
