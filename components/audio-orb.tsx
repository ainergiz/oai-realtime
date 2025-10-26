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
  const inputBufferRef = useRef<ByteFrequencyArray | null>(null);
  const outputBufferRef = useRef<ByteFrequencyArray | null>(null);
  const basePositionsRef = useRef<Float32Array | null>(null);
  const needsIdleResetRef = useRef(!active);

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

  useEffect(() => {
    if (!meshRef.current) {
      return;
    }
    const geometry = meshRef.current.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute("position");
    basePositionsRef.current = position
      ? Float32Array.from(position.array as Float32Array)
      : null;
    return () => {
      basePositionsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      needsIdleResetRef.current = true;
    }
  }, [active]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    const geometry = mesh.geometry as THREE.BufferGeometry;
    const positions = geometry.getAttribute("position");
    const basePositions = basePositionsRef.current;

    if (!active) {
      if (needsIdleResetRef.current && positions && basePositions) {
        const arr = positions.array as Float32Array;
        arr.set(basePositions);
        positions.needsUpdate = true;
        geometry.computeVertexNormals();

        mesh.scale.setScalar(1);
        mesh.rotation.set(0, 0, 0);

        const material = mesh.material as THREE.MeshStandardMaterial;
        material.color.set("#48d0ff");
        material.emissive.set("#0b1426");
        material.emissiveIntensity = 0.5;

        state.scene.rotation.set(0, 0, 0);
        state.camera.position.set(0, 0, 3.6);
        state.camera.lookAt(0, 0, 0);

        needsIdleResetRef.current = false;
      }
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
    const easedIntensity = intensity / (1 + intensity * 0.8);
    const targetScale = 1 + easedIntensity * 0.3;
    const targetRotation = 0.25 + easedIntensity * 0.6;

    if (positions && basePositions) {
      const arr = positions.array as Float32Array;
      const time = state.clock.elapsedTime * 1.4;
      const spikeStrength = 0.16 + easedIntensity * 0.35;
      for (let index = 0; index < arr.length; index += 3) {
        const baseX = basePositions[index];
        const baseY = basePositions[index + 1];
        const baseZ = basePositions[index + 2];
        const radius = Math.sqrt(baseX * baseX + baseY * baseY + baseZ * baseZ);
        if (radius === 0) {
          continue;
        }
        const normX = baseX / radius;
        const normY = baseY / radius;
        const normZ = baseZ / radius;
        const wave =
          Math.sin(time + index * 0.015) * 0.06 * (1 + easedIntensity * 0.4);
        const spike = radius + spikeStrength + wave;
        arr[index] = normX * spike;
        arr[index + 1] = normY * spike;
        arr[index + 2] = normZ * spike;
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    }

    const currentScale = mesh.scale.x;
    const lerpFactor = THREE.MathUtils.clamp(delta * 4, 0, 1);
    const nextScale = THREE.MathUtils.lerp(
      currentScale,
      targetScale,
      lerpFactor,
    );

    mesh.scale.setScalar(nextScale);
    mesh.rotation.x += delta * (0.32 + easedIntensity * 0.9);
    mesh.rotation.y += delta * (0.26 + easedIntensity * 0.75);
    mesh.rotation.z += delta * (0.18 + easedIntensity * 0.6);

    const material = mesh.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = 0.45 + easedIntensity * 1.1;
    material.color.setHSL(0.54, 0.62, 0.44 + easedIntensity * 0.16);
    material.emissive.setHSL(0.5, 0.8, 0.38 + easedIntensity * 0.22);

    const camera = state.camera;
    camera.position.lerp(
      new THREE.Vector3(
        Math.sin(state.clock.elapsedTime * 0.3) * (1.3 + easedIntensity * 0.5),
        Math.cos(state.clock.elapsedTime * 0.2) * (0.9 + easedIntensity * 0.4),
        3.4 + easedIntensity * 0.35,
      ),
      lerpFactor,
    );
    camera.lookAt(0, 0, 0);

    state.scene.rotation.y += delta * (0.045 + targetRotation * 0.04);
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

  return <mesh ref={meshRef} geometry={geom} material={material} />;
};

export const AudioOrb = (props: AudioOrbProps) => {
  return (
    <div className="relative isolate h-40 w-40 overflow-hidden rounded-full border border-white/10 bg-linear-to-br from-emerald-500/12 via-sky-500/12 to-purple-500/12 shadow-[0_0_18px_rgba(72,255,220,0.22)] sm:h-52 sm:w-52">
      <Canvas
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        camera={{ position: [0, 0, 3.6], fov: 48 }}
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
