import React from "react";

// Original design dimensions the SVG paths were drawn at
const D_W = 377;
const D_H = 208;

export const DashboardBackground = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    fill="none"
    viewBox={`0 0 ${D_W} ${D_H}`}
    preserveAspectRatio="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    {...props}
  >
    {/* Outer border frame with inset corners */}
    <path
      d="M0.5 0.886719H376.5V203.962H366.745V15.0754H11.1415V207.509"
      className="stroke-[#3A464F] dark:stroke-white"
      strokeDasharray="2 2"
      vectorEffect="non-scaling-stroke"
    />
    {/* Left arch curve (above left button) */}
    <path
      d="M12.0283 38.1318C38.3365 44.3394 110.64 54.0941 189.387 43.4526"
      className="stroke-[#3A464F] dark:stroke-white"
      strokeDasharray="2 2"
      vectorEffect="non-scaling-stroke"
    />
    {/* Right arch curve (above right button) */}
    <path
      d="M190.274 43.4529C225.745 49.3649 310.523 55.6906 365.858 37.2454"
      className="stroke-[#3A464F] dark:stroke-white"
      strokeDasharray="2 2"
      vectorEffect="non-scaling-stroke"
    />
    {/* Center vertical divider */}
    <path
      d="M186.726 46.1134V43.9768M186.726 43.9768V206.623H192.934V43.9768L186.726 43.9768Z"
      className="stroke-[#3A464F] dark:stroke-white"
      strokeDasharray="2 2"
      vectorEffect="non-scaling-stroke"
    />
    {/* Left lower arch curve */}
    <path
      d="M12.0283 95.7734C27.3994 101.981 84.7453 112.09 191.16 102.868"
      className="stroke-[#3A464F] dark:stroke-white"
      strokeDasharray="2 2"
      vectorEffect="non-scaling-stroke"
    />
    {/* Right lower arch curve */}
    <path
      d="M193.821 101.981C228.701 106.12 312.119 111.204 366.745 98.4341"
      className="stroke-[#3A464F] dark:stroke-white"
      strokeDasharray="2 2"
      vectorEffect="non-scaling-stroke"
    />
    {/* Left edge vertical line */}
    <path
      d="M0.5 0V207.51"
      className="stroke-[#3A464F] dark:stroke-white"
      strokeDasharray="2 2"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
);

export const IncomeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    height="62"
    width="60"
    fill="none"
    viewBox="0 0 62 60"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    {...props}
  >
    <path
      d="M50 25C50 38.8062 38.8062 50 25 50C11.1938 50 0 38.8062 0 25C0 11.1938 11.1938 0 25 0C38.8062 0 50 11.1938 50 25Z"
      fill="#3FCB72"
    />
    <path
      d="M38.9868 21.7129H28.8668V12H22.1201V21.7129H12V28.1882H22.1201V37.9011H28.8668V28.1882H38.9868V21.7129Z"
      fill="white"
    />
  </svg>
);

export const ExpenseIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    height="62"
    width="60"
    fill="none"
    viewBox="0 0 60 62"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    {...props}
  >
    <path
      d="M30.2203 55.2747C16.4352 55.2747 5.22034 44.0598 5.22034 30.2747C5.22034 16.4895 16.4352 5.27466 30.2203 5.27466C44.0055 5.27466 55.2203 16.4895 55.2203 30.2747C55.2203 44.0598 44.0055 55.2747 30.2203 55.2747Z"
      fill="#E33B80"
    />
    <path d="M17.3368 26.9802H42.1037V34.6889H17.3368V26.9802Z" fill="white" />
  </svg>
);

export const CurvedLine = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    height="10"
    width="174"
    fill="none"
    viewBox="0 0 174 10"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    {...props}
  >
    <path
      d="M0.05896 4.03399C34.9395 8.17235 118.357 13.2566 172.983 0.486816"
      className="stroke-[#94A3B8] dark:stroke-white"
      strokeDasharray="2 2"
    />
  </svg>
);
