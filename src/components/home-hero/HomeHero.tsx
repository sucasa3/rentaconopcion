import { MapPin } from "lucide-react";
import type { HomeHeroView } from "@/lib/home-hero-data";
import heroPhoto from "@/assets/home-hero-photo.jpg.asset.json";

export function HomeHero({
  data,
}: {
  data: HomeHeroView;
}) {
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-elevated">
      <div className="relative h-[300px] w-full sm:h-[420px] lg:h-[500px]">
        <img
          src={heroPhoto.url}
          alt={data.address ? `Photo of ${data.address}` : "Your home"}
          width={1920}
          height={1200}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="home-photo-vignette pointer-events-none absolute inset-0" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <div className="inline-flex items-center gap-2 text-[12px] font-medium text-primary-foreground/75">
            <MapPin className="h-3.5 w-3.5" /> Your home
          </div>
          <h1 className="mt-1 max-w-[24ch] text-[26px] font-semibold leading-tight text-primary-foreground drop-shadow-lg sm:text-4xl lg:text-5xl">
            {data.address ?? "Add your home address"}
          </h1>
          {!data.address && (
            <p className="mt-2 max-w-md text-sm text-primary-foreground/75">
              Add your address to connect your home records.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

