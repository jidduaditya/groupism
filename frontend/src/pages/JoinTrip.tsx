import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { api, setTokens } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

function generateMemberToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

const JoinTrip = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tripInfo, setTripInfo] = useState<{
    name: string;
    budget: string;
    dates: string;
    memberCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Couple linking state
  const [joinedStep, setJoinedStep] = useState(false);
  const [partnerToken, setPartnerToken] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!code) return;
    api
      .get(`/api/trips/${code}`)
      .then((data) => {
        const t = data.trip;
        const budgetMin = (t.budget_min || 0).toLocaleString("en-IN");
        const budgetMax = (t.budget_max || 0).toLocaleString("en-IN");
        const from = t.travel_from
          ? new Date(t.travel_from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
          : "";
        const to = t.travel_to
          ? new Date(t.travel_to).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
          : "";
        setTripInfo({
          name: t.name,
          budget: `₹${budgetMin} – ₹${budgetMax}`,
          dates: from && to ? `${from}–${to}` : "",
          memberCount: data.members?.length || 0,
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [code]);

  const handleJoin = async () => {
    if (!code || !displayName.trim()) return;
    setJoining(true);
    try {
      const memberToken = generateMemberToken();
      const data = await api.post(`/api/trips/${code}/join`, {
        display_name: displayName.trim(),
        member_token: memberToken,
      });
      setTokens(code, { memberToken, memberId: data.member.id });
      setJoinedStep(true);
    } catch (err: any) {
      toast({ title: "Failed to join", description: err.message, variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  const handleLink = async () => {
    if (!code || !partnerToken.trim()) return;
    setLinking(true);
    try {
      await api.post(
        `/api/trips/${code}/couples/link`,
        { partner_member_token: partnerToken.trim() },
        code
      );
      toast({ title: "Linked with partner!" });
      navigate(`/trip/${code}`);
    } catch (err: any) {
      toast({ title: "Failed to link", description: err.message, variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  const handleSolo = async () => {
    if (!code) return;
    try {
      await api.post(`/api/trips/${code}/couples/solo`, {}, code);
    } catch {
      // Silent — solo registration is best-effort
    }
    navigate(`/trip/${code}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen relative z-10">
        <Header />
        <div className="flex items-center justify-center min-h-screen">
          <p className="font-ui text-t-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !tripInfo) {
    return (
      <div className="min-h-screen relative z-10">
        <Header />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="font-display text-[32px] font-bold text-t-primary mb-2">Trip not found</h1>
            <p className="font-ui text-t-secondary">{error || "This invite link may be invalid."}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="min-h-screen flex flex-col lg:flex-row">
        {/* Left — trip context */}
        <div className="flex-1 flex flex-col justify-center px-6 md:px-16 lg:pl-[12vw] lg:pr-12 pt-24 lg:pt-0 pb-8 lg:pb-0">
          <p className="eyebrow mb-4">YOU'VE BEEN INVITED TO</p>
          <h1 className="font-display text-[40px] md:text-[56px] lg:text-[72px] font-black leading-[0.95] text-t-primary mb-4">
            {tripInfo.name}
          </h1>
          <p className="font-mono text-[13px] text-t-secondary">
            {tripInfo.budget}  ·  {tripInfo.dates}
          </p>
          <p className="font-ui font-light text-sm text-t-secondary mt-2">
            {tripInfo.memberCount} {tripInfo.memberCount === 1 ? "person is" : "people are"} planning this trip
          </p>
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px bg-b-subtle self-stretch my-20" />
        <div className="lg:hidden h-px bg-b-subtle mx-6" />

        {/* Right — join action or couple linking */}
        <div className="flex-1 flex flex-col justify-center px-6 md:px-16 lg:pr-[12vw] lg:pl-12 pt-8 lg:pt-0 pb-24 lg:pb-0 max-w-lg lg:max-w-none">
          {!joinedStep ? (
            <>
              <p className="font-mono text-xs text-t-tertiary mb-6">
                Code: {code}
              </p>
              <div className="space-y-4">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full text-lg font-ui bg-transparent border-b border-b-mid pb-3 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
                <Button
                  variant="amber"
                  className="w-full h-[52px] text-sm font-ui font-medium"
                  disabled={!displayName.trim() || joining}
                  onClick={handleJoin}
                >
                  {joining ? "Joining..." : "Join"}
                </Button>
              </div>
            </>
          ) : (
            <div>
              <p className="font-display text-xl text-t-primary mb-1">
                Are you travelling as a couple?
              </p>
              <p className="font-ui font-light text-sm text-t-secondary mb-6">
                Link with your partner so your responses count as one.
              </p>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Partner's link token"
                  value={partnerToken}
                  onChange={(e) => setPartnerToken(e.target.value)}
                  className="w-full text-sm font-mono bg-transparent border-b border-b-mid pb-2 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-amber transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleLink()}
                />
                <Button
                  variant="amber"
                  className="w-full h-11 text-sm font-ui font-medium"
                  disabled={!partnerToken.trim() || linking}
                  onClick={handleLink}
                >
                  {linking ? "Linking..." : "Link with partner"}
                </Button>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSolo}
                    className="flex-1 font-ui text-sm text-t-secondary hover:text-t-primary transition-colors"
                  >
                    I'm travelling solo
                  </button>
                  <button
                    onClick={() => navigate(`/trip/${code}`)}
                    className="flex-1 font-ui text-sm text-t-tertiary hover:text-t-secondary transition-colors"
                  >
                    Skip for now
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JoinTrip;
