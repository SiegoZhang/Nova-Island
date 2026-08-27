import { AboutNovaSection } from "@/components/AboutNovaSection";
import { AiCommunityCarousel } from "@/components/AiCommunityCarousel";
import { ContactCtaSection } from "@/components/ContactCtaSection";
import { FdeSection } from "@/components/FdeSection";
import { Footer } from "@/components/Footer";
import { GridRails } from "@/components/GridRails";
import { HeroSection } from "@/components/HeroSection";
import { Navbar } from "@/components/Navbar";
import { SectionDivider } from "@/components/SectionDivider";
import { TeamSection } from "@/components/TeamSection";
import { HeroThemeProvider } from "@/lib/heroTheme";

export default function Home() {
  return (
    <HeroThemeProvider>
      <div className="min-h-screen">
        <Navbar />
        <main className="relative">
          <GridRails />
          <HeroSection />
          <SectionDivider showJoints={false} />
          <AboutNovaSection />
          <SectionDivider />
          <AiCommunityCarousel />
          <SectionDivider />
          <FdeSection />
          <SectionDivider />
          <TeamSection />
          <SectionDivider showJoints={false} />
          <ContactCtaSection />
        </main>
        <Footer />
      </div>
    </HeroThemeProvider>
  );
}
