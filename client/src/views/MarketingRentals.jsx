import React from "react";
import PublicLinkBox from "../components/PublicLinkBox";

// Rental Space's one marketing tool — relocated out of RentalSpaces.jsx
// into the Marketing tab. No flyer, no marketing email — just the public
// link and website embed.
export default function MarketingRentals() {
  return (
    <PublicLinkBox basePath="rentals" embedBasePath="rentals/embed" embedTitle="Rental Request" description="Set a link so renters can check availability and submit a request from your website." />
  );
}
