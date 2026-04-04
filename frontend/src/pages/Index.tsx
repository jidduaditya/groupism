import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { api, setTokens } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const Home = () => {
  const navigate = useNavigate();
  const [tripName, setTripName] = useState("");
  const [organiserName, setOrganiserName] = useState("");
  const [groupSize, setGroupSize] = useState(6);
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ tripName?: string; organiserName?: string }>({});

  const handleCreate = async () => {
    const newErrors: typeof errors = {};
    if (!tripName.trim()) newErrors.tripName = "Trip name is required";
    if (!organiserName.trim()) newErrors.organiserName = "Your name is required";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const trip = await api.post("/api/trips", {
        name: tripName,
        organiser_name: organiserName,
        group_size: groupSize,
      });

      setTokens(trip.join_token, {
        memberToken: trip.member_token,
        memberId: trip.member_id,
        organiserToken: trip.organiser_token,
      });
      localStorage.setItem(
        `triphaus:${trip.join_token}:group_size`,
        String(groupSize)
      );

      navigate(`/trip/${trip.join_token}`);
    } catch (err: any) {
      toast({
        title: "Couldn't create your trip",
        description: err.message || "Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="min-h-screen flex flex-col justify-center px-6 md:px-16 lg:pl-[12vw] lg:pr-[20vw] pt-24 pb-16">
        <div className="max-w-md">
          {/* Hero */}
          <div className="mb-2">
            <span className="font-display font-black text-4xl sm:text-5xl leading-[1.0] text-t-primary block">
              every group trip.
            </span>
            <span className="font-display font-light text-4xl sm:text-5xl leading-[1.0] text-t-primary block">
              the same five people.
            </span>
          </div>

          <style>{`
            @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(12px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          <div className="flex flex-wrap justify-between gap-3 mt-8">
            {[
              { quote: "itinerary v14. sent. again.", name: "the organiser", subtitle: "no thanks received" },
              { quote: "so flexible! (that's a no)", name: "the vetoer", subtitle: "vetoes everything" },
              { quote: "wait — what's the plan guys??", name: "the ghost", subtitle: "2hrs before the flight" },
              { quote: "sent!! (6 days later)", name: "the late one", subtitle: "always the last" },
              { quote: "best trip ever!! (zero planning)", name: "the passenger", subtitle: "contributed nothing" },
            ].map((c, i) => (
              <div
                key={c.name}
                className="w-[140px] rounded-[4px] bg-surface border border-b-subtle p-3"
                style={{
                  opacity: 0,
                  animation: `fadeInUp 0.4s ease-out ${i * 80}ms forwards`,
                }}
              >
                <p className="font-ui text-xs text-t-primary leading-snug mb-2">
                  "{c.quote}"
                </p>
                <p className="font-display text-xs font-bold text-t-primary">{c.name}</p>
                <p className="font-ui text-[10px] text-t-tertiary">{c.subtitle}</p>
              </div>
            ))}
          </div>

          <div className="w-16 h-[1px] bg-accent-amber my-8" />

          {/* Section 1 — Create a trip */}
          <h1 className="font-display font-bold text-4xl md:text-3xl text-t-primary mb-8">
            Plan your next group trip
          </h1>

          <div className="space-y-6">
            <div>
              <input
                type="text"
                value={tripName}
                onChange={(e) => {
                  setTripName(e.target.value);
                  if (errors.tripName) setErrors((prev) => ({ ...prev, tripName: undefined }));
                }}
                placeholder="e.g. Goa March 2026"
                className="w-full font-ui text-lg bg-transparent border-b border-b-mid pb-3 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
              />
              {errors.tripName && (
                <p className="text-xs text-accent-terra mt-1">{errors.tripName}</p>
              )}
            </div>

            <div>
              <input
                type="text"
                value={organiserName}
                onChange={(e) => {
                  setOrganiserName(e.target.value);
                  if (errors.organiserName) setErrors((prev) => ({ ...prev, organiserName: undefined }));
                }}
                placeholder="e.g. Aditya"
                className="w-full font-ui text-lg bg-transparent border-b border-b-mid pb-3 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
              />
              {errors.organiserName && (
                <p className="text-xs text-accent-terra mt-1">{errors.organiserName}</p>
              )}
            </div>

            <div className="flex items-center gap-6">
              <button
                onClick={() => setGroupSize(Math.max(2, groupSize - 1))}
                aria-label="Decrease group size"
                className="text-t-secondary text-2xl font-ui font-light hover:text-t-primary transition-colors h-11 w-11 flex items-center justify-center"
              >
                −
              </button>
              <span className="font-mono text-2xl text-accent-amber w-12 text-center" aria-label={`${groupSize} people`}>
                {groupSize}
              </span>
              <button
                onClick={() => setGroupSize(Math.min(20, groupSize + 1))}
                aria-label="Increase group size"
                className="text-t-secondary text-2xl font-ui font-light hover:text-t-primary transition-colors h-11 w-11 flex items-center justify-center"
              >
                +
              </button>
            </div>

            <button
              disabled={loading}
              onClick={handleCreate}
              className="bg-amber text-t-primary font-display font-bold w-full h-14 rounded-[4px] text-base hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Trip Room →"}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-px bg-[var(--border-subtle)]"></div>
            <span className="font-ui text-xs text-t-tertiary uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-[var(--border-subtle)]"></div>
          </div>

          {/* Section 2 — Join */}
          <div className="space-y-3">
            <label className="font-ui font-light text-sm text-t-secondary">
              Already have a code?
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="e.g. goa-march-a3f2"
              className="w-full font-mono text-lg bg-transparent border-b border-b-mid pb-3 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
            />
            <button
              onClick={() => inviteCode.trim() && navigate(`/join/${inviteCode.trim()}`)}
              className="border border-b-mid text-t-primary bg-transparent rounded-[4px] h-10 px-5 font-ui text-sm hover:bg-hover transition-colors"
            >
              Join trip →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
