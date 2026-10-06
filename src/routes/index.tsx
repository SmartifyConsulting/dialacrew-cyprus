import { createFileRoute, Link } from "@tanstack/react-router";
import { TopNav } from "@/components/AppShell";
import logo from "@/assets/bookacrew-logo.png.asset.json";
import { SERVICE_SKILLS } from "@/lib/skills";

const HERO_BG = "https://static.wixstatic.com/media/20efcd_c74b87f40292491e9dbcf1db2483f78c~mv2.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Book a Crew | Film, TV & Commercial Production Crew" },
      { name: "description", content: "Book professional film, TV and commercial crew, kit and locations — and manage every production from call sheet to final invoice." },
      { property: "og:title", content: "Book a Crew | Professional Production Crew on Demand" },
      { property: "og:description", content: "Find and book directors, camera, sound, lighting and production crew for your next shoot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: HERO_BG },
      { name: "twitter:image", content: HERO_BG },
    ],
  }),
  component: Index,
});

// Copy verbatim from https://ma9599.wixsite.com/dialacrew
const story =
  "With film and video content more popular than ever, we have created an agency that will help connect businesses with the creative professionals needed to make content to delight your target audiences. No matter what goals you want to achieve, we'll help you find the qualified professionals and resources you need to make your ideas become a reality .";

const services = SERVICE_SKILLS;

const gallery = [
  "20efcd_db152710e0a5462593057d2c8b6399b0~mv2_d_6000_4000_s_4_2.jpg",
  "20efcd_e2af50ab819c4d75a76737b10f45413c~mv2_d_4459_2508_s_4_2.jpg",
  "20efcd_0441576308664e628165e05b23f246ac~mv2_d_4912_4912_s_4_2.jpg",
  "20efcd_6d1e817a2b7b49238632dc63a9dc957f~mv2_d_4000_6000_s_4_2.jpg",
  "20efcd_e0e502b4361b46749241ff3bb8ccada6~mv2_d_5472_3648_s_4_2.jpg",
  "20efcd_95b110353618461f9db9f46af409abb7~mv2_d_6000_4000_s_4_2.jpg",
  "20efcd_10b45c794d4347b2bc6076a650ca645c~mv2_d_4592_3064_s_4_2.jpg",
  "20efcd_b02266a1d44348d6abdf5a3b96dfb790~mv2_d_5398_3648_s_4_2.jpg",
  "20efcd_a69645ee1cf7464782078d4f58c57c76~mv2_d_4896_3264_s_4_2.jpg",
].map((f) => `https://static.wixstatic.com/media/${f}/v1/fill/w_626,h_624,q_90/${f}`);

const social = [
  { label: "Instagram", href: "https://www.instagram.com/dialacrewcyrus/" },
  { label: "Facebook", href: "https://www.facebook.com/Dial-A-Crew-341215269680331/" },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <section className="relative bg-cover bg-center" style={{ backgroundImage: `url(${HERO_BG})` }}>
        <div className="absolute inset-0 bg-background/40" />
        <div className="relative mx-auto flex min-h-[760px] max-w-5xl flex-col items-center justify-center px-4 py-16">
          <img src={logo.url} alt="Dial a Crew Cyprus" className="w-[490px] md:w-[680px]" />
        </div>
      </section>

      <section id="about" className="mx-auto max-w-4xl scroll-mt-28 px-4 py-16 text-center">
        <h2 className="font-script text-7xl text-foreground md:text-8xl">Our Story</h2>
        <p className="mt-10 text-left text-xl font-light leading-snug text-foreground">{story}</p>
      </section>

      <section id="services" className="mx-auto max-w-5xl scroll-mt-28 px-4 py-16">
        <h2 className="text-center font-script text-7xl text-foreground md:text-8xl">Service offering</h2>
        <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2 md:grid-cols-3">
          {services.map((s) => (
            <div key={s} className="border-b border-primary/60 pb-2 text-lg font-light text-foreground">
              {s}
            </div>
          ))}
        </div>
      </section>

      <section id="gallery" className="scroll-mt-28 py-16">
        <h2 className="text-center font-script text-7xl text-foreground md:text-8xl">Gallery</h2>
        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-2 gap-1 px-4 md:grid-cols-3">
          {gallery.map((src) => (
            <img key={src} src={src} alt="" loading="lazy" className="aspect-square w-full object-cover" />
          ))}
        </div>
      </section>

      <section id="contact" className="scroll-mt-28 bg-primary py-16 text-primary-foreground">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center font-script text-6xl md:text-7xl">Contact Us Now</h2>
          <p className="mt-4 text-center text-lg">Office : +357 22 546 345 Mobile +357 99 604740</p>
          <div className="mt-12 grid gap-10 text-center md:grid-cols-3">
            <div>
              <h3 className="font-display text-xl font-semibold uppercase tracking-widest">SAY HELLO</h3>
              <p className="mt-3">
                Phone: <a href="tel:+35799604740">+35799604740</a>
              </p>
              <p>
                Email:{" "}
                <a href="mailto:info@dialacrew.com" className="underline">
                  info@dialacrew.com
                </a>
              </p>
            </div>
            <div>
              <h3 className="font-display text-xl font-semibold uppercase tracking-widest">OUR ADDRESS</h3>
              <p className="mt-3">32 Stasikratous</p>
              <p>Nicosia</p>
              <p>Cyprus</p>
            </div>
            <div>
              <h3 className="font-display text-xl font-semibold uppercase tracking-widest">OPENING HOURS</h3>
              <p className="mt-3">Mon - Fri: 7am - 10pm</p>
              <p>Saturday: 8am - 10pm</p>
              <p>Sunday: 8am - 11pm</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-background py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 text-center">
          <div className="flex flex-wrap justify-center gap-4">
            {social.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm uppercase tracking-widest text-muted-foreground hover:text-primary"
              >
                {s.label}
              </a>
            ))}
            <Link to="/terms" className="text-sm uppercase tracking-widest text-muted-foreground hover:text-primary">
              Terms &amp; Conditions
            </Link>
            <Link to="/privacy" className="text-sm uppercase tracking-widest text-muted-foreground hover:text-primary">
              Privacy Policy
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Dial a Crew Cyprus. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
