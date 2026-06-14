import { forwardRef, type ForwardedRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import type { GLTF } from 'three-stdlib';
import { WHEEL_SEGMENT } from './utils/constants';

type GLTFResult = GLTF & {
  nodes: {
    Cylinder: THREE.Mesh;
    Cylinder_1: THREE.Mesh;
  };
  materials: {
    'Material.001': THREE.MeshStandardMaterial;
    'Material.002': THREE.MeshStandardMaterial;
  };
};

type ReelProps = React.JSX.IntrinsicElements['group'] & {
  value?: number;
  reelSegment: number;
  map: number;
};

const Reel = forwardRef(
  (props: ReelProps, ref: ForwardedRef<THREE.Group>): React.JSX.Element => {
    const { reelSegment } = props;

    const gltf = useGLTF('models/reel.glb') as unknown as GLTFResult;
    const { nodes, materials } = gltf;

    const colorMap0 = useLoader(THREE.TextureLoader, 'images/reel_0.png');
    const colorMap1 = useLoader(THREE.TextureLoader, 'images/reel_1.png');
    const colorMap2 = useLoader(THREE.TextureLoader, 'images/reel_2.png');

    const activeColorMap =
      props.map === 1 ? colorMap1 : props.map === 2 ? colorMap2 : colorMap0;

    return (
      <group {...props} ref={ref} dispose={null}>
        <group
          rotation={[reelSegment * WHEEL_SEGMENT - 0.2, 0, -Math.PI / 2]}
          scale={[1, 0.29, 1]}
        >
          <mesh castShadow receiveShadow geometry={nodes.Cylinder.geometry}>
            <meshStandardMaterial map={activeColorMap} />
          </mesh>
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cylinder_1.geometry}
            material={materials['Material.002']}
          />
        </group>
      </group>
    );
  },
);

useGLTF.preload('models/reel.glb');
export default Reel;
