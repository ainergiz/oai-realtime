"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type ByteFrequencyArray = Uint8Array<ArrayBuffer>;

type AudioOrbProps = {
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
  active: boolean;
};

const createAnalyserBuffer = (
  analyser: AnalyserNode | null,
): ByteFrequencyArray | null =>
  analyser
    ? (new Uint8Array(analyser.frequencyBinCount) as ByteFrequencyArray)
    : null;

const calculateLevel = (
  analyser: AnalyserNode | null,
  buffer: ByteFrequencyArray | null,
  weight = 1,
) => {
  if (!analyser || !buffer) {
    return 0;
  }
  analyser.getByteFrequencyData(buffer);
  const sliceEnd = Math.max(4, Math.floor(buffer.length * weight));
  let total = 0;
  for (let index = 0; index < sliceEnd; index += 1) {
    total += buffer[index] ?? 0;
  }
  return total / sliceEnd / 255;
};

const OrbMesh = ({ inputAnalyser, outputAnalyser, active }: AudioOrbProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);
  const inputBufferRef = useRef<ByteFrequencyArray | null>(null);
  const outputBufferRef = useRef<ByteFrequencyArray | null>(null);

  useEffect(() => {
    inputBufferRef.current = createAnalyserBuffer(inputAnalyser);
    return () => {
      inputBufferRef.current = null;
    };
  }, [inputAnalyser]);

  useEffect(() => {
    outputBufferRef.current = createAnalyserBuffer(outputAnalyser);
    return () => {
      outputBufferRef.current = null;
    };
  }, [outputAnalyser]);

  useFrame((state, delta) => {
    if (!meshRef.current) {
      return;
    }

    const inputLevel = calculateLevel(
      inputAnalyser,
      inputBufferRef.current,
      0.2,
    );
    const outputLevel = calculateLevel(
      outputAnalyser,
      outputBufferRef.current,
      0.2,
    );
    const intensity = Math.max(inputLevel, outputLevel);
    const targetScale = 1 + intensity * 0.75;
    const targetRotation = 0.3 + intensity * 0.9;

    const currentScale = meshRef.current.scale.x;
    const lerpFactor = THREE.MathUtils.clamp(delta * 4, 0, 1);
    const nextScale = THREE.MathUtils.lerp(
      currentScale,
      targetScale,
      lerpFactor,
    );

    meshRef.current.scale.setScalar(nextScale);
    meshRef.current.rotation.x += delta * (0.4 + inputLevel * 1.4);
    meshRef.current.rotation.y += delta * (0.3 + outputLevel * 1.2);
    meshRef.current.rotation.z += delta * (0.2 + inputLevel * 0.8);

    const material = meshRef.current.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = 0.4 + intensity * 1.6;
    material.color.setHSL(0.54, 0.65, 0.45 + intensity * 0.2);
    material.emissive.setHSL(0.5, 0.85, 0.4 + intensity * 0.3);

    if (glowRef.current) {
      glowRef.current.intensity = 1.2 + intensity * 3.2;
    }

    const camera = state.camera;
    camera.position.lerp(
      new THREE.Vector3(
        Math.sin(state.clock.elapsedTime * 0.3) * 1.6,
        Math.cos(state.clock.elapsedTime * 0.2) * 1.1,
        3.4 + intensity * 0.5,
      ),
      lerpFactor,
    );
    camera.lookAt(0, 0, 0);

    state.scene.rotation.y += delta * (0.05 + targetRotation * 0.05);
  });

  const geom = useMemo(() => new THREE.IcosahedronGeometry(1.2, 4), []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#48d0ff"),
        emissive: new THREE.Color("#0b1426"),
        emissiveIntensity: 0.5,
        metalness: 0.6,
        roughness: 0.25,
      }),
    [],
  );

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.visible = active;
    }
  }, [active]);

  return (
    <>
      <mesh ref={meshRef} geometry={geom} material={material} />
      <pointLight
        ref={glowRef}
        position={[0, 0, 3.5]}
        intensity={1.2}
        distance={9}
        color="#7cf6ff"
      />
    </>
  );
};

export const AudioOrb = (props: AudioOrbProps) => {
  return (
    <div className="relative isolate h-64 w-64 overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-emerald-500/10 via-sky-500/10 to-purple-500/10 shadow-[0_0_40px_rgba(72,255,220,0.18)] sm:h-72 sm:w-72">
      <Canvas
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        camera={{ position: [0, 0, 3.8], fov: 45 }}
      >
        <color attach="background" args={["#05040a"]} />
        <fog attach="fog" args={["#05040a", 6, 12]} />
        <ambientLight intensity={0.25} />
        <hemisphereLight
          args={["#6bf7ff", "#04010a", 0.8]}
          position={[0, 2, 0]}
        />
        <directionalLight
          position={[2.5, 1.5, 3]}
          intensity={1.6}
          color="#8defff"
          castShadow
        />
        <OrbMesh {...props} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-radial from-white/12 via-transparent to-transparent mix-blend-screen" />
    </div>
  );
};
