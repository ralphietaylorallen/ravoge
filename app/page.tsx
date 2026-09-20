import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calendar, Trend, Users } from "@/components/icons";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";

const capabilities = [
  { icon: Trend, title: "Adapts live", copy: "Adjusts training in real time based on performance, readiness, and long-term goals." },
  { icon: Users, title: "Keeps every coach informed", copy: "A single source of truth for clients, sessions, notes, and progress." },
  { icon: Calendar, title: "Turns progress into rebooking", copy: "Better results, happier clients, and higher retention for your gym." },
];

const coachPoints = ["Real-time training guidance", "Simple, fast logging", "Works across all your coaches"];
const clientPoints = ["Session summaries", "Visible progress over time", "Easy booking with their coach"];

function SectionLabel({ number, children }: { number: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#8A8171]">
      <span>{number}</span><span aria-hidden="true" className="h-px w-12 bg-[#8A8171]/60" />{children}
    </div>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="mt-8 space-y-4 text-sm text-[#E6E4DF] sm:text-base">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-3">
          <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#B4AC9B] text-[0.65rem] text-[#B4AC9B]">✓</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header />
      <main id="main-content" className="overflow-hidden bg-[#050606]">
        <section className="relative flex min-h-[760px] items-end border-b border-white/15 sm:min-h-[820px] lg:min-h-[790px] lg:items-center">
          <div className="hero-image absolute inset-0">
            <Image src="/images/ravoge-hero-coach-v2.png" alt="A private training coach reviews a session on a tablet in a dark strength gym." fill priority sizes="100vw" className="object-cover object-[64%_center] sm:object-[60%_center] lg:object-center" />
          </div>
          <div className="relative z-10 mx-auto w-full max-w-[1480px] px-5 pb-16 pt-40 sm:px-8 sm:pb-20 lg:px-12 lg:pb-0 lg:pt-28">
            <div className="max-w-[620px]">
              <h1 className="font-display text-[clamp(3.4rem,6.5vw,6.2rem)] font-medium leading-[0.96] tracking-[-0.065em] text-[#F6F5F3]">Every set makes the next one <span className="text-[#B4AC9B]">smarter.</span></h1>
              <p className="mt-7 max-w-md text-base leading-7 text-[#E6E4DF]/85 sm:text-lg">Ravoge gives gyms one intelligent system for coaches, clients, programming, progress, and booking.</p>
              <div className="mt-9 flex flex-wrap items-center gap-3 sm:gap-6">
                <Link className="button button-outline min-w-40" href="/owner?intent=signup">Get started <ArrowRight /></Link>
                <Link className="nav-link px-2 py-3 text-sm underline decoration-[#8A8171]" href="/owner?intent=login">Owner login</Link>
              </div>
              <p className="mt-12 text-[0.65rem] uppercase tracking-[0.34em] text-[#8A8171]">Train with intent</p>
            </div>
          </div>
        </section>

        <section id="what-we-do" className="border-b border-white/15 bg-[#07100F] px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto max-w-[1384px]">
            <SectionLabel number="01">What Ravoge does</SectionLabel>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {capabilities.map(({ icon: Icon, title, copy }) => (
                <article key={title} className="min-h-56 border border-white/15 bg-[#09100F]/85 p-6 sm:p-8">
                  <Icon className="h-9 w-9 text-[#B4AC9B]" />
                  <h2 className="mt-7 font-display text-xl font-medium tracking-[-0.03em]">{title}</h2>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-[#B4AC9B]">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="for-gyms" className="grid border-b border-white/15 bg-[#050606] lg:min-h-[650px] lg:grid-cols-[1.65fr_0.85fr]">
          <div className="relative aspect-[4/3] min-h-0 overflow-hidden sm:aspect-auto sm:min-h-[560px] lg:min-h-full">
            <Image src="/images/ravoge-coach-ipad-v2.png" alt="A coach holds a tablet on the training floor." fill sizes="(max-width: 1024px) 100vw, 65vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#050606]/70" />
            <div className="absolute left-[20.5%] top-[20%] w-[42%] rotate-[4deg] border border-white/10 bg-[#07100F]/95 p-3 text-[#E6E4DF] shadow-2xl backdrop-blur-sm sm:p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div><p className="text-[0.42rem] uppercase tracking-[0.2em] text-[#B4AC9B] sm:text-[0.58rem]">Workout</p><p className="mt-1 font-display text-[0.6rem] sm:text-sm">Lower body strength</p></div>
                <span className="border border-[#B4AC9B]/50 px-2 py-1 text-[0.4rem] text-[#B4AC9B] sm:text-[0.55rem]">In progress</span>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-2 text-[0.42rem] sm:text-[0.62rem]">
                <span className="text-[#8A8171]">Exercise</span><span className="text-[#8A8171]">Sets</span><span className="text-[#8A8171]">RPE</span>
                <span>Back squat</span><span>4</span><span>7</span><span>Walking lunge</span><span>3</span><span>8</span><span>Leg press</span><span>3</span><span>8</span>
              </div>
              <div className="mt-3 border border-[#B4AC9B]/40 p-2 text-[0.42rem] text-[#B4AC9B] sm:text-[0.62rem]">Next set · 100 kg × 5 @ RPE 7</div>
            </div>
          </div>
          <div className="flex items-center bg-[linear-gradient(135deg,#07100F,#050606)] px-5 py-16 sm:px-12 lg:px-14">
            <div className="max-w-md">
              <SectionLabel number="02">Coach iPad</SectionLabel>
              <h2 className="mt-7 font-display text-[clamp(2.7rem,4.2vw,4.6rem)] leading-[1] tracking-[-0.055em]">Built for the training floor.</h2>
              <p className="mt-6 text-base leading-7 text-[#B4AC9B]">Log sessions, get real-time recommendations, and keep everything in sync—so your coaches can focus on what matters most.</p>
              <CheckList items={coachPoints} />
            </div>
          </div>
        </section>

        <section className="grid border-b border-white/15 bg-[#050606] lg:min-h-[650px] lg:grid-cols-[0.85fr_1.65fr]">
          <div className="order-2 flex items-center bg-[linear-gradient(135deg,#050606,#07100F)] px-5 py-16 sm:px-12 lg:order-1 lg:px-14">
            <div className="max-w-md lg:ml-auto">
              <SectionLabel number="03">Client mobile</SectionLabel>
              <h2 className="mt-7 font-display text-[clamp(2.7rem,4.2vw,4.6rem)] leading-[1] tracking-[-0.055em]">Progress clients can see.</h2>
              <p className="mt-6 text-base leading-7 text-[#B4AC9B]">Clients get a clear view of their training, progress, and next session—keeping them engaged and coming back.</p>
              <CheckList items={clientPoints} />
            </div>
          </div>
          <div className="relative order-1 aspect-[4/3] min-h-0 overflow-hidden sm:aspect-auto sm:min-h-[580px] lg:order-2 lg:min-h-full">
            <Image src="/images/ravoge-client-phone-v2.png" alt="A client holds a phone in a private training gym." fill sizes="(max-width: 1024px) 100vw, 65vw" className="object-cover object-center" />
            <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-[#050606]/65" />
            <div className="absolute left-[59.5%] top-[14.5%] flex h-[57%] w-[18.5%] flex-col overflow-hidden rounded-[12%] bg-[#07100F]/95 p-[1.3%] text-[#E6E4DF] shadow-2xl">
              <p className="text-center font-display text-[0.42rem] uppercase tracking-[0.2em] text-[#B4AC9B] sm:text-[0.58rem]">Ravoge</p>
              <div className="mt-[8%] border-b border-white/10 pb-[7%]"><p className="text-[0.35rem] text-[#8A8171] sm:text-[0.5rem]">Session score</p><p className="font-display text-[0.8rem] sm:text-xl">9.2<span className="text-[0.35rem] text-[#8A8171] sm:text-[0.5rem]"> / 10</span></p><div className="mt-1 h-[2px] w-full bg-white/10"><div className="h-full w-[92%] bg-[#B4AC9B]" /></div></div>
              <div className="mt-[9%]"><p className="text-[0.35rem] text-[#8A8171] sm:text-[0.5rem]">Strength trend</p><svg aria-hidden="true" className="mt-1 h-8 w-full sm:h-14" viewBox="0 0 100 40" fill="none"><path d="M2 35 20 30 36 31 52 21 67 18 82 11 98 5" stroke="#B4AC9B" strokeWidth="2" /></svg></div>
              <div className="mt-auto bg-[#B4AC9B] py-[5%] text-center text-[0.35rem] font-semibold text-[#050606] sm:text-[0.5rem]">Book session</div>
            </div>
          </div>
        </section>

        <section className="border-b border-white/15 bg-[#07100F] px-5 py-20 text-center sm:px-8 sm:py-24 lg:px-12">
          <div className="mx-auto max-w-4xl">
            <div className="flex justify-center"><SectionLabel number="04">For gym owners</SectionLabel></div>
            <h2 className="mt-8 font-display text-[clamp(2.25rem,4.2vw,4rem)] leading-tight tracking-[-0.05em]">Run private training as one intelligent system.</h2>
            <p className="mt-4 text-[#B4AC9B]">Coaches perform better. Clients stay longer. Your gym grows.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3 sm:gap-5">
              <Link className="button button-light min-w-52" href="/owner?intent=signup">Create owner account <ArrowRight /></Link>
              <Link className="button button-outline min-w-44" href="/owner?intent=login">Owner login</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#050606] px-5 py-12 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1384px] flex-col items-center gap-9">
          <Logo />
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-[#B4AC9B]">
            <Link className="nav-link" href="#what-we-do">What we do</Link><Link className="nav-link" href="#for-gyms">For gyms</Link><Link className="nav-link" href="/owner?intent=login">Owner login</Link><Link className="nav-link" href="/coach">Coach access</Link><Link className="nav-link" href="/client">Client access</Link>
          </nav>
          <p className="text-xs text-[#53544D]">Built for a stronger tomorrow · © 2026 Ravoge</p>
        </div>
      </footer>
    </>
  );
}
