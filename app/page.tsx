import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Calendar, Spark, Trend, Users } from "@/components/icons";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";

const capabilities = [
  {
    number: "01",
    icon: Spark,
    title: "Adaptive workouts",
    copy: "Each completed set becomes useful context. Ravoge helps shape what comes next around the client in front of you—not an average on a spreadsheet.",
  },
  {
    number: "02",
    icon: Users,
    title: "Coach continuity",
    copy: "Every coach can see where the last session ended, what changed, and what needs attention before the client walks onto the floor.",
  },
  {
    number: "03",
    icon: Trend,
    title: "Visible progress",
    copy: "Turn scattered training history into a clear story clients can understand, celebrate, and stay committed to over time.",
  },
  {
    number: "04",
    icon: Calendar,
    title: "Simple booking",
    copy: "Keep future scheduling close to the training experience, with a clean path from the next workout to the next appointment.",
  },
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header />
      <main id="main-content" className="overflow-hidden bg-[#050606]">
        <section className="relative flex min-h-[860px] items-end sm:min-h-[900px] lg:min-h-[820px] lg:items-center">
          <div className="hero-image absolute inset-0">
            <Image
              src="/images/ravoge-coach-tablet.png"
              alt="A private strength coach reviews a session on a tablet while a client trains."
              fill
              priority
              sizes="100vw"
              className="object-cover object-[62%_center] sm:object-[60%_center] lg:object-center"
            />
          </div>
          <div className="relative z-10 mx-auto w-full max-w-[1480px] px-5 pb-16 pt-40 sm:px-8 sm:pb-20 lg:px-12 lg:pb-0 lg:pt-28">
            <div className="max-w-[760px]">
              <p className="eyebrow">Built for private training</p>
              <h1 className="mt-6 max-w-[750px] font-display text-[clamp(3.45rem,8.2vw,7.7rem)] font-medium leading-[0.88] tracking-[-0.07em] text-[#F6F5F3]">
                Every set makes the next one <span className="text-[#B4AC9B]">smarter.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-[#E6E4DF]/80 sm:text-lg sm:leading-8">
                One connected training system that helps independent gyms coach with context, adapt every session, and show clients the progress they are building.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link className="button button-light min-w-40" href="/owner?intent=signup">
                  Build your gym <ArrowUpRight />
                </Link>
                <Link className="button button-ghost min-w-36" href="#what-we-do">
                  See how it works <ArrowRight />
                </Link>
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 z-10 hidden border-l border-t border-white/10 bg-[#050606]/75 px-7 py-5 backdrop-blur-xl md:block">
            <p className="text-xs uppercase tracking-[0.16em] text-[#B4AC9B]">Training intelligence</p>
            <p className="mt-1 font-display text-lg text-[#F6F5F3]">Built set by set.</p>
          </div>
        </section>

        <section id="what-we-do" className="relative border-t border-white/10 px-5 py-24 sm:px-8 sm:py-32 lg:px-12 lg:py-40">
          <div aria-hidden="true" className="absolute left-1/2 top-0 h-px w-[80vw] -translate-x-1/2 bg-gradient-to-r from-transparent via-[#B4AC9B]/30 to-transparent" />
          <div className="mx-auto max-w-[1384px]">
            <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-24">
              <div>
                <p className="eyebrow">A smarter training floor</p>
                <p className="mt-6 max-w-sm text-sm leading-6 text-[#B4AC9B]">Ravoge keeps people—not software—at the center of private training.</p>
              </div>
              <h2 className="font-display text-[clamp(2.7rem,5.8vw,6.4rem)] leading-[0.96] tracking-[-0.06em] text-[#E6E4DF]">
                Your gym already creates valuable training data. <span className="text-[#53544D]">Now it can remember what matters.</span>
              </h2>
            </div>

            <div className="mt-20 grid border-l border-t border-white/10 sm:grid-cols-2 lg:mt-28 lg:grid-cols-4">
              {capabilities.map(({ number, icon: Icon, title, copy }) => (
                <article key={number} className="group min-h-[340px] border-b border-r border-white/10 bg-[#090B0B] p-6 transition-colors hover:bg-[#0B1715] sm:p-8">
                  <div className="flex items-center justify-between text-[#B4AC9B]">
                    <span className="font-display text-xs tracking-[0.16em]">{number}</span>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="mt-24">
                    <h3 className="font-display text-2xl tracking-[-0.04em] text-[#F6F5F3]">{title}</h3>
                    <p className="mt-4 text-sm leading-6 text-[#B4AC9B]">{copy}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#07100F] px-5 py-24 sm:px-8 sm:py-32 lg:px-12 lg:py-40">
          <div className="mx-auto grid max-w-[1384px] items-center gap-16 lg:grid-cols-[1.08fr_0.92fr] lg:gap-24">
            <div className="relative">
              <div className="relative aspect-[16/11] overflow-hidden border border-white/10">
                <Image
                  src="/images/ravoge-coach-tablet.png"
                  alt="A coach uses a tablet alongside a client during a strength session."
                  fill
                  sizes="(max-width: 1024px) 100vw, 55vw"
                  className="object-cover object-right"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050606]/70 via-transparent to-transparent" />
              </div>
              <div className="absolute -bottom-9 left-4 right-4 border border-white/10 bg-[#101615]/95 p-5 shadow-2xl backdrop-blur-lg sm:left-auto sm:right-8 sm:w-[330px] sm:p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.15em] text-[#B4AC9B]">Today’s session</p>
                    <p className="mt-2 font-display text-lg">Lower strength · 04</p>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#B4AC9B] text-xs font-bold text-[#050606]">72</span>
                </div>
                <div className="mt-5 flex gap-2" aria-label="Three of four session blocks completed">
                  <span className="h-1 flex-1 bg-[#B4AC9B]" />
                  <span className="h-1 flex-1 bg-[#B4AC9B]" />
                  <span className="h-1 flex-1 bg-[#B4AC9B]" />
                  <span className="h-1 flex-1 bg-white/15" />
                </div>
              </div>
            </div>
            <div className="pt-8 sm:pt-0">
              <p className="eyebrow">Coach iPad</p>
              <h2 className="mt-6 font-display text-[clamp(2.8rem,5vw,5.3rem)] leading-[0.96] tracking-[-0.06em]">The handoff is already done.</h2>
              <p className="mt-7 max-w-xl text-base leading-7 text-[#B4AC9B] sm:text-lg sm:leading-8">
                Coaches sign in individually on the shared gym iPad. The next session opens with the right client, the right history, and the details that deserve attention.
              </p>
              <ul className="mt-9 space-y-5 text-sm text-[#E6E4DF] sm:text-base">
                {["See the last coach’s notes before the warm-up", "Record sets and changes without leaving the floor", "Keep the gym’s coaching standard consistent across the team"].map((item) => (
                  <li key={item} className="flex gap-4 border-b border-white/10 pb-5"><span className="text-[#B4AC9B]">↳</span>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="px-5 py-24 sm:px-8 sm:py-32 lg:px-12 lg:py-40">
          <div className="mx-auto grid max-w-[1384px] items-center gap-16 lg:grid-cols-[0.88fr_1.12fr] lg:gap-28">
            <div className="lg:pr-6">
              <p className="eyebrow">Client mobile</p>
              <h2 className="mt-6 font-display text-[clamp(2.8rem,5vw,5.3rem)] leading-[0.96] tracking-[-0.06em]">Progress they can feel—and see.</h2>
              <p className="mt-7 max-w-xl text-base leading-7 text-[#B4AC9B] sm:text-lg sm:leading-8">
                Clients get a private view of their own training story: what they have built, what is coming next, and when they are back in the gym.
              </p>
              <div className="mt-10 grid grid-cols-2 gap-px border border-white/10 bg-white/10">
                <div className="bg-[#080B0B] p-5 sm:p-7"><strong className="font-display text-3xl text-[#F6F5F3] sm:text-4xl">+18%</strong><span className="mt-2 block text-xs text-[#B4AC9B]">Training volume</span></div>
                <div className="bg-[#080B0B] p-5 sm:p-7"><strong className="font-display text-3xl text-[#F6F5F3] sm:text-4xl">14</strong><span className="mt-2 block text-xs text-[#B4AC9B]">Week streak</span></div>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[700px]">
              <div className="relative ml-auto aspect-[4/5] w-[82%] overflow-hidden border border-white/10 sm:w-[75%]">
                <Image
                  src="/images/ravoge-client-mobile.png"
                  alt="A client reviews their training progress on a phone after a workout."
                  fill
                  sizes="(max-width: 1024px) 80vw, 38vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050606]/45 via-transparent to-transparent" />
              </div>
              <div className="metric-grid absolute bottom-8 left-0 w-[66%] border border-white/10 bg-[#0D1514]/95 p-5 shadow-2xl backdrop-blur-xl sm:bottom-12 sm:w-[58%] sm:p-7">
                <div className="flex items-center justify-between">
                  <div><p className="text-[0.65rem] uppercase tracking-[0.15em] text-[#B4AC9B]">Strength trend</p><p className="mt-2 font-display text-2xl">Moving up</p></div>
                  <Trend className="h-6 w-6 text-[#B4AC9B]" />
                </div>
                <svg aria-label="An upward training progress trend" className="mt-7 h-24 w-full" viewBox="0 0 300 96" fill="none">
                  <path d="M2 83 C45 73 58 81 93 55 S147 56 179 37 S242 42 298 8" stroke="#B4AC9B" strokeWidth="3" className="progress-line" />
                  <path d="M2 83 C45 73 58 81 93 55 S147 56 179 37 S242 42 298 8 V96 H2Z" fill="url(#chart)" opacity=".2" />
                  <defs><linearGradient id="chart" x1="150" y1="0" x2="150" y2="96" gradientUnits="userSpaceOnUse"><stop stopColor="#B4AC9B"/><stop offset="1" stopColor="#B4AC9B" stopOpacity="0"/></linearGradient></defs>
                </svg>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#07100F] px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
          <div className="mx-auto grid max-w-[1384px] gap-12 lg:grid-cols-3 lg:gap-0">
            <div className="lg:pr-14"><p className="eyebrow">One connected rhythm</p><h2 className="mt-6 font-display text-4xl tracking-[-0.05em] sm:text-5xl">From booked to better.</h2></div>
            <div className="border-white/10 lg:border-l lg:px-14"><span className="font-display text-sm text-[#B4AC9B]">01 / Arrive ready</span><p className="mt-5 text-base leading-7 text-[#E6E4DF]">Booking brings the next visit into view, while session context helps the coach prepare before the client arrives.</p></div>
            <div className="border-white/10 lg:border-l lg:pl-14"><span className="font-display text-sm text-[#B4AC9B]">02 / Leave progressing</span><p className="mt-5 text-base leading-7 text-[#E6E4DF]">What happened today strengthens tomorrow’s plan and adds another clear chapter to the client’s progress.</p></div>
          </div>
        </section>

        <section className="relative px-5 py-28 sm:px-8 sm:py-36 lg:px-12 lg:py-44">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(180,172,155,0.10),transparent_34%)]" />
          <div className="relative mx-auto max-w-[1100px] text-center">
            <p className="mx-auto justify-center eyebrow before:hidden">For independent gym owners</p>
            <h2 className="mt-7 font-display text-[clamp(3rem,7.5vw,7.4rem)] leading-[0.9] tracking-[-0.07em]">Build a gym that gets better with every session.</h2>
            <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-[#B4AC9B] sm:text-lg">Create your owner account when Ravoge opens access. The foundation is ready; authentication and onboarding are intentionally next.</p>
            <Link className="button button-light mt-10 min-w-48" href="/owner?intent=signup">Create owner account <ArrowUpRight /></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#050606] px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1384px] flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#B4AC9B]">
            <Link className="nav-link" href="#what-we-do">What we do</Link>
            <Link className="nav-link" href="/owner?intent=login">Owner login</Link>
            <Link className="nav-link" href="/coach">Coach access</Link>
            <Link className="nav-link" href="/client">Client access</Link>
          </nav>
          <p className="text-xs text-[#53544D]">© 2026 Ravoge</p>
        </div>
      </footer>
    </>
  );
}
