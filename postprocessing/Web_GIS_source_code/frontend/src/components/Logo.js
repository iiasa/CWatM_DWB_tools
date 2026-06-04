import './Logo.css';

// Funding acknowledgment lockup: EU emblem ("Co-funded by the European Union"),
// Interreg Danube Region Programme, and the Danube Water Balance project.
// The official lockup is a single combined image kept intact per Interreg
// branding guidance. It links to the project page and is fixed top-center.
const PROJECT_URL = 'https://interreg-danube.eu/projects/danube-water-balance';
const LOGO_ALT =
  'Co-funded by the European Union — Interreg Danube Region Programme — Danube Water Balance project';

const Logo = () => {
  return (
    <a
      className="app-logo"
      href={PROJECT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={LOGO_ALT}
      title={LOGO_ALT}
    >
      <img src="/photos/logo.png" alt={LOGO_ALT} />
    </a>
  );
};

export default Logo;
