import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HomeHeroData } from "@/lib/home-hero-data";
import { ZONE_COLOR } from "@/lib/home-hero-data";

type Props = {
  data: HomeHeroData;
  reducedMotion: boolean;
};

export function HouseModel({ data, reducedMotion }: Props) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!group.current || reducedMotion) return;
    const t = state.clock.elapsedTime;
    // gentle idle sway
    group.current.rotation.y = -0.35 + Math.sin(t * 0.35) * 0.08;
    group.current.position.y = Math.sin(t * 0.6) * 0.02;
  });

  const wall = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f7f3ec", roughness: 0.85 }), []);
  const roof = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d2653a", roughness: 0.7 }), []);
  const trim = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2b2b2b", roughness: 0.6 }), []);
  const glass = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#ffd27a", emissive: "#ffb347", emissiveIntensity: 0.9, roughness: 0.3 }),
    [],
  );
  const door = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1f2a44", roughness: 0.5 }), []);

  const zoneEmissive = (z: keyof HomeHeroData["zones"]) => ZONE_COLOR[data.zones[z]];

  return (
    <group ref={group} rotation={[0, -0.35, 0]} position={[0, -0.2, 0]}>
      {/* Ground disc */}
      <mesh receiveShadow position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.2, 64]} />
        <meshStandardMaterial color="#eef2ee" roughness={1} />
      </mesh>

      {/* Equity ring (glowing base) */}
      <EquityRing pct={data.equityPct} />

      {/* Main body */}
      <mesh castShadow receiveShadow position={[0, 0.1, 0]} material={wall}>
        <boxGeometry args={[2.4, 1.4, 1.6]} />
      </mesh>

      {/* Side wing */}
      <mesh castShadow receiveShadow position={[1.4, -0.05, 0.15]} material={wall}>
        <boxGeometry args={[1.0, 1.1, 1.3]} />
      </mesh>

      {/* Roof — main (triangular prism via cone with 4 sides) */}
      <mesh castShadow position={[0, 1.0, 0]} rotation={[0, Math.PI / 4, 0]} material={roof}>
        <coneGeometry args={[1.75, 0.9, 4]} />
      </mesh>

      {/* Roof — wing */}
      <mesh castShadow position={[1.4, 0.7, 0.15]} rotation={[0, Math.PI / 4, 0]} material={roof}>
        <coneGeometry args={[0.95, 0.6, 4]} />
      </mesh>

      {/* Roof health puck */}
      <ZonePuck position={[0, 1.55, 0]} color={zoneEmissive("roof")} />

      {/* Windows (glowing) */}
      <mesh position={[-0.7, 0.25, 0.81]} material={glass}>
        <boxGeometry args={[0.5, 0.5, 0.05]} />
      </mesh>
      <mesh position={[0.7, 0.25, 0.81]} material={glass}>
        <boxGeometry args={[0.5, 0.5, 0.05]} />
      </mesh>
      <mesh position={[1.4, 0.05, 0.81]} material={glass}>
        <boxGeometry args={[0.45, 0.45, 0.05]} />
      </mesh>

      {/* Door */}
      <mesh position={[0, -0.25, 0.81]} material={door}>
        <boxGeometry args={[0.45, 0.85, 0.05]} />
      </mesh>

      {/* Chimney = HVAC zone */}
      <mesh castShadow position={[-0.7, 1.2, -0.2]} material={trim}>
        <boxGeometry args={[0.2, 0.55, 0.2]} />
      </mesh>
      <ZonePuck position={[-0.7, 1.6, -0.2]} color={zoneEmissive("hvac")} />

      {/* Plumbing pipe stub on wing roof */}
      <mesh castShadow position={[1.7, 1.1, 0.2]} material={trim}>
        <cylinderGeometry args={[0.06, 0.06, 0.4, 16]} />
      </mesh>
      <ZonePuck position={[1.7, 1.4, 0.2]} color={zoneEmissive("plumbing")} scale={0.6} />

      {/* Electrical meter box on side */}
      <mesh position={[-1.22, 0.1, 0.4]} material={trim}>
        <boxGeometry args={[0.05, 0.3, 0.25]} />
      </mesh>
      <ZonePuck position={[-1.28, 0.35, 0.4]} color={zoneEmissive("electrical")} scale={0.5} />

      {/* Path */}
      <mesh position={[0, -0.59, 1.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.5, 1.6]} />
        <meshStandardMaterial color="#dcd6cb" roughness={1} />
      </mesh>

      {/* Little trees */}
      <Tree position={[-2.1, -0.35, 0.9]} />
      <Tree position={[2.4, -0.4, -0.6]} scale={0.85} />
    </group>
  );
}

function ZonePuck({ position, color, scale = 0.8 }: { position: [number, number, number]; color: string; scale?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = 1.1 + Math.sin(s.clock.elapsedTime * 2) * 0.4;
  });
  return (
    <mesh ref={ref} position={position} scale={scale}>
      <sphereGeometry args={[0.09, 20, 20]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} toneMapped={false} />
    </mesh>
  );
}

function EquityRing({ pct }: { pct: number }) {
  const arc = useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, 2.6, 2.6, 0, Math.PI * 2 * pct, false, 0);
    const pts = curve.getPoints(96).map((p) => new THREE.Vector3(p.x, 0, p.y));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [pct]);
  const full = useMemo(() => {
    const curve = new THREE.EllipseCurve(0, 0, 2.6, 2.6, 0, Math.PI * 2, false, 0);
    const pts = curve.getPoints(128).map((p) => new THREE.Vector3(p.x, 0, p.y));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  return (
    <group position={[0, -0.58, 0]}>
      <primitive object={new THREE.Line(full, new THREE.LineBasicMaterial({ color: "#cfd8dc", transparent: true, opacity: 0.6 }))} />
      <primitive object={new THREE.Line(arc, new THREE.LineBasicMaterial({ color: "#22c55e", linewidth: 2 }))} />
    </group>
  );
}

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 0.35, 8]} />
        <meshStandardMaterial color="#7a5a3a" />
      </mesh>
      <mesh castShadow position={[0, 0.45, 0]}>
        <coneGeometry args={[0.28, 0.7, 12]} />
        <meshStandardMaterial color="#4a7c59" />
      </mesh>
    </group>
  );
}
