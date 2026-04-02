import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";

const JoinTrip = () => {
  const { code } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative z-10">
      <Header />
      {/* Desktop: split layout. Mobile: stacked full-screen */}
      <div className="min-h-screen flex flex-col lg:flex-row">
        {/* Left — trip context */}
        <div className="flex-1 flex flex-col justify-center px-6 md:px-16 lg:pl-[12vw] lg:pr-12 pt-24 lg:pt-0 pb-8 lg:pb-0">
          <p className="eyebrow mb-4">YOU'VE BEEN INVITED TO</p>
          <h1 className="font-display text-[40px] md:text-[56px] lg:text-[72px] font-black leading-[0.95] text-t-primary mb-4">
            Goa March '26
          </h1>
          <p className="font-mono text-[13px] text-t-secondary">
            ₹8,000 – ₹15,000  ·  15–18 Mar
          </p>
          <p className="font-ui font-light text-sm text-t-secondary mt-2">
            6 people are planning this trip
          </p>
        </div>

        {/* Divider — vertical on desktop, horizontal on mobile */}
        <div className="hidden lg:block w-px bg-b-subtle self-stretch my-20" />
        <div className="lg:hidden h-px bg-b-subtle mx-6" />

        {/* Right — join action */}
        <div className="flex-1 flex flex-col justify-center px-6 md:px-16 lg:pr-[12vw] lg:pl-12 pt-8 lg:pt-0 pb-24 lg:pb-0 max-w-lg lg:max-w-none">
          <p className="font-mono text-xs text-t-tertiary mb-6">
            Code: {code}
          </p>
          <Button
            variant="amber"
            className="w-full h-[52px] text-sm font-ui font-medium"
            onClick={() => navigate("/trip/demo-trip-123")}
          >
            Join
          </Button>
        </div>
      </div>
    </div>
  );
};

export default JoinTrip;
