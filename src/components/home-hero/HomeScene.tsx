import { Canvas } from "@react-three/fiber";
import { HouseModel } from "./HouseModel";
import type { HomeHeroData } from "@/lib/home-hero-data";

export default function HomeScene({ data, reducedMotion }: { data: HomeHeroData; reducedMotion: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      shadows
      camera={{ position: [3.6, 2.8, 4.8], fov: 32 }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[5, 6, 4]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-4, 3, -2]} intensity={0.35} color="#a8c4ff" />
      <HouseModel data={data} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
