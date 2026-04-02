import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { api, setTokens } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const CreateTrip = () => {
  const navigate = useNavigate();
  const [tripName, setTripName] = useState("");
  const [organiserName, setOrganiserName] = useState("");
  const [groupSize, setGroupSize] = useState(6);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const trip = await api.post("/api/trips", {
        name: tripName,
        organiser_name: organiserName || "Organiser",
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
        title: "Failed to create trip",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      <div className="max-w-xl mx-auto px-6 pt-24 pb-20">
        <section>
          <h2 className="font-display text-[36px] md:text-[40px] font-bold leading-[1.05] text-t-primary mb-8">
            Name the trip
          </h2>

          <div className="space-y-8">
            <input
              type="text"
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              placeholder="Goa March '26"
              className="w-full text-[20px] md:text-[24px] font-ui font-medium bg-transparent border-b border-b-mid pb-3 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
            />

            <div>
              <label className="eyebrow block mb-3">YOUR NAME</label>
              <input
                type="text"
                value={organiserName}
                onChange={(e) => setOrganiserName(e.target.value)}
                placeholder="Aditya"
                className="w-full text-lg font-ui bg-transparent border-b border-b-mid pb-2 text-t-primary placeholder:text-t-tertiary focus:outline-none focus:border-t-secondary transition-colors"
              />
            </div>

            <div>
              <label className="eyebrow block mb-4">HOW MANY PEOPLE</label>
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setGroupSize(Math.max(2, groupSize - 1))}
                  className="text-t-secondary text-2xl font-ui font-light hover:text-t-primary transition-colors h-11 w-11 flex items-center justify-center"
                >
                  −
                </button>
                <span className="font-mono text-[32px] text-t-primary w-12 text-center">
                  {groupSize}
                </span>
                <button
                  onClick={() => setGroupSize(groupSize + 1)}
                  className="text-t-secondary text-2xl font-ui font-light hover:text-t-primary transition-colors h-11 w-11 flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>

            <Button
              variant="amber"
              className="w-full h-12 text-sm"
              disabled={!tripName || !organiserName || loading}
              onClick={handleCreate}
            >
              {loading ? "Creating..." : "Create Trip Room →"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CreateTrip;
