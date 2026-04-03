import { Link } from "react-router-dom";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-10">
      <Link to="/" className="font-display font-medium text-lg text-t-primary tracking-wide">
        Groupism
      </Link>
    </header>
  );
};

export default Header;
