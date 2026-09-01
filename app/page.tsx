import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { RapidFunnel } from "@/components/site/RapidFunnel";
import { TiposCredito } from "@/components/site/TiposCredito";
import { Sectores } from "@/components/site/Sectores";
import { Beneficios } from "@/components/site/Beneficios";
import { Testimonios } from "@/components/site/Testimonios";
import { Proceso } from "@/components/site/Proceso";
import { Ubicacion } from "@/components/site/Ubicacion";
import { Footer } from "@/components/site/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <RapidFunnel />
        <TiposCredito />
        <Sectores />
        <Beneficios />
        <Testimonios />
        <Proceso />
        <Ubicacion />
      </main>
      <Footer />
    </>
  );
}
