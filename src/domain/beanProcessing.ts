export type ProcessDetailConfig = { label: string; placeholder: string };

const details: Record<string, ProcessDetailConfig> = {
  Washed: {
    label: "Washed process detail",
    placeholder: "e.g. double washed, extended or yeast-inoculated",
  },
  Natural: {
    label: "Natural process detail",
    placeholder: "e.g. anaerobic natural or extended natural",
  },
  Honey: { label: "Honey process type", placeholder: "e.g. white, yellow, red or black honey" },
  Anaerobic: {
    label: "Anaerobic fermentation detail",
    placeholder: "e.g. washed/natural, duration, yeast or thermal shock",
  },
  "Carbonic maceration": {
    label: "Maceration detail",
    placeholder: "e.g. whole cherry, 72 hours, temperature controlled",
  },
  "Wet-hulled": { label: "Wet-hulled detail", placeholder: "e.g. Giling Basah and drying details" },
  "Co-fermented": {
    label: "Co-fermented with",
    placeholder: "e.g. passion fruit, mango, cinnamon or specific yeast",
  },
  Infused: { label: "Infused with", placeholder: "e.g. honey and mango, strawberry or cinnamon" },
  Decaffeinated: {
    label: "Decaffeination method",
    placeholder: "e.g. Swiss Water, sugarcane EA or CO₂",
  },
  "Experimental / other": {
    label: "Process details",
    placeholder: "Describe fermentation, additions and drying method",
  },
};

export function processDetailConfig(process?: string): ProcessDetailConfig {
  return (
    details[process || ""] || {
      label: "Process details",
      placeholder: "Optional processing details",
    }
  );
}
