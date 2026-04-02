import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { motion } from "framer-motion";
import { ArrowRight, Plane } from "lucide-react";

const Home = () => {
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState("");

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="min-h-screen flex flex-col justify-center px-6 md:px-16 lg:pl-[12vw] lg:pr-[20vw] pt-24 pb-16">
        <div className="max-w-3xl">
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-2 mb-6"
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber/10 text-amber text-xs font-ui font-medium tracking-wide uppercase">
              <Plane className="w-3 h-3" />
              Group Travel
            </span>
          </motion.div>

          {/* Headline */}
          <h1>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="block font-display font-black italic text-[48px] md:text-[64px] lg:text-[80px] leading-[0.95] text-t-primary"
            >
              every group trip.
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="block font-display font-light text-[48px] md:text-[64px] lg:text-[80px] leading-[0.95] text-t-secondary"
            >
              the same five people.
            </motion.span>
          </h1>

          {/* Accent line */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="origin-left w-[100px] h-[2px] mt-8 bg-t-primary/20"
          />

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="font-ui font-medium text-t-primary text-[16px] mt-6 max-w-md leading-relaxed"
          >
            the organiser who's done it alone for the last time.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="space-y-3 max-w-md mt-10"
          >
            <button
              onClick={() => navigate("/create")}
              className="group w-full h-14 px-8 flex items-center justify-between rounded-lg font-ui font-semibold text-sm bg-amber text-[var(--bg-base)] transition-all duration-300 hover:bg-amber-light hover:shadow-lg hover:shadow-amber/20 hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <span>Create a Room</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="enter invite code"
                  className="w-full h-14 px-4 bg-t-primary text-[var(--bg-base)] border-none rounded-lg font-mono text-sm placeholder:text-[var(--bg-base)]/40 focus:outline-none focus:ring-2 focus:ring-t-primary/40 transition-all duration-200"
                />
              </div>
              <button
                onClick={() => inviteCode && navigate(`/join/${inviteCode}`)}
                className="h-14 px-6 bg-t-primary text-[var(--bg-base)] rounded-lg font-ui font-semibold text-sm hover:bg-t-primary/85 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
              >
                Join
              </button>
            </div>
          </motion.div>

          {/* Bottom decorative dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="flex gap-1.5 mt-12"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-amber" />
            <div className="w-1.5 h-1.5 rounded-full bg-terra" />
            <div className="w-1.5 h-1.5 rounded-full bg-green" />
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Home;
