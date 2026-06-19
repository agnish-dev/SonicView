import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, Cylinder, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

function Soundwave() {
  const groupRef = useRef();
  
  // Create a series of vertical bars to form a soundwave
  const barsCount = 60;
  const bars = useMemo(() => {
    const temp = [];
    for (let i = 0; i < barsCount; i++) {
      // Create a wave-like pattern using Math.sin
      const x = (i - barsCount / 2) * 0.4;
      // Combine multiple sine waves for a more complex audio-like look
      const baseHeight = Math.sin(i * 0.2) * Math.sin(i * 0.05) * 4;
      const height = Math.abs(baseHeight) + 0.5 + Math.random() * 2;
      temp.push({ x, height, id: i });
    }
    return temp;
  }, []);

  useFrame((state) => {
    if (groupRef.current) {
      // Pulse the soundwave slightly
      const time = state.clock.getElapsedTime();
      groupRef.current.children.forEach((child, i) => {
        const scaleY = 1 + Math.sin(time * 3 + i * 0.5) * 0.2;
        child.scale.y = scaleY;
      });
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, -2]}>
      {bars.map((bar) => (
        <mesh key={bar.id} position={[bar.x, 0, 0]}>
          <planeGeometry args={[0.08, bar.height]} />
          <meshBasicMaterial 
            color={bar.x < 0 ? "#b300ff" : "#00e5ff"} 
            transparent 
            opacity={0.6} 
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {/* Horizontal glowing line in the middle */}
      <mesh position={[0, 0, 0.1]}>
        <planeGeometry args={[25, 0.1]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[25, 0.5]} />
        <meshBasicMaterial color="#b300ff" transparent opacity={0.3} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function Particles() {
  const count = 200;
  const mesh = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 20;
      const y = (Math.random() - 0.5) * 20;
      const z = (Math.random() - 0.5) * 10 - 5;
      const speed = 0.2 + Math.random() * 0.5;
      temp.push({ x, y, z, speed });
    }
    return temp;
  }, []);

  useFrame((state, delta) => {
    particles.forEach((particle, i) => {
      particle.y += particle.speed * delta;
      if (particle.y > 10) particle.y = -10;
      
      dummy.position.set(particle.x, particle.y, particle.z);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[null, null, count]}>
      <sphereGeometry args={[0.05, 8, 8]} />
      <meshBasicMaterial color="#00e5ff" transparent opacity={0.6} blending={THREE.AdditiveBlending} />
    </instancedMesh>
  );
}

function DNAModel(props) {
  const groupRef = useRef();

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.4;
    }
  });

  const pairs = 24; 
  const radius = 2.0; 
  const height = 14; 
  const twist = Math.PI * 3; 
  const heightStep = height / pairs;
  const twistStep = twist / pairs;

  const rungs = [];

  for (let i = 0; i < pairs; i++) {
    const y = -height / 2 + i * heightStep;
    const angle = i * twistStep;
    const x1 = Math.cos(angle) * radius;
    const z1 = Math.sin(angle) * radius;
    const x2 = Math.cos(angle + Math.PI) * radius;
    const z2 = Math.sin(angle + Math.PI) * radius;

    rungs.push({
      y, angle, x1, z1, x2, z2, id: i
    });
  }

  return (
    <group ref={groupRef} {...props}>
      {rungs.map((rung) => (
        <group key={rung.id}>
          {/* Backbone spheres */}
          <Sphere position={[rung.x1, rung.y, rung.z1]} args={[0.35, 16, 16]}>
            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.5} roughness={0.2} metalness={0.8} />
          </Sphere>
          <Sphere position={[rung.x2, rung.y, rung.z2]} args={[0.35, 16, 16]}>
            <meshStandardMaterial color="#b300ff" emissive="#b300ff" emissiveIntensity={1.5} roughness={0.2} metalness={0.8} />
          </Sphere>
          
          {/* Connecting cylinder (rung) */}
          <group position={[0, rung.y, 0]} rotation={[0, -rung.angle, 0]}>
            <Cylinder args={[0.08, 0.08, radius * 2, 8]} rotation={[0, 0, Math.PI / 2]}>
              <meshStandardMaterial color="#ffffff" emissive="#b300ff" emissiveIntensity={0.5} opacity={0.7} transparent />
            </Cylinder>
          </group>
        </group>
      ))}
    </group>
  );
}

export default function DNACanvas() {
  return (
    <div style={{ width: '100%', height: '500px', cursor: 'grab' }}>
      <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
        <color attach="background" args={['transparent']} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={2} color="#00e5ff" />
        <pointLight position={[-10, -10, -10]} intensity={2} color="#b300ff" />
        
        {/* The components to match the image */}
        <Particles />
        <Soundwave />
        <DNAModel />
        
        <OrbitControls enableZoom={false} autoRotate={false} />
      </Canvas>
    </div>
  );
}
