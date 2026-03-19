export interface VerificationResult {
  whatsappActive: boolean;
  validNumber: boolean;
  spamReputation: "clean" | "suspect" | "spam";
  blacklisted: boolean;
  details: {
    carrier: string;
    region: string;
    numberType: string;
    spamReports: number;
  };
}

// Valid Brazilian DDD codes
const validDDDs = new Set([
  11,12,13,14,15,16,17,18,19, // SP
  21,22,24, // RJ
  27,28, // ES
  31,32,33,34,35,37,38, // MG
  41,42,43,44,45,46, // PR
  47,48,49, // SC
  51,53,54,55, // RS
  61, // DF
  62,64, // GO
  63, // TO
  65,66, // MT
  67, // MS
  68, // AC
  69, // RO
  71,73,74,75,77, // BA
  79, // SE
  81,87, // PE
  82, // AL
  83, // PB
  84, // RN
  85,88, // CE
  86,89, // PI
  91,93,94, // PA
  92,97, // AM
  95, // RR
  96, // AP
  98,99, // MA
]);

const carriers = ["Vivo", "Claro", "TIM", "Oi", "Nextel"];
const regions: Record<number, string> = {
  11: "São Paulo - SP", 21: "Rio de Janeiro - RJ", 31: "Belo Horizonte - MG",
  41: "Curitiba - PR", 51: "Porto Alegre - RS", 61: "Brasília - DF",
  71: "Salvador - BA", 81: "Recife - PE", 85: "Fortaleza - CE",
  91: "Belém - PA", 92: "Manaus - AM",
};

function getRegion(ddd: number): string {
  return regions[ddd] || `DDD ${ddd}`;
}

/**
 * Simulates phone verification.
 * In production, this would call real APIs via Edge Functions.
 */
export function verifyPhone(digits: string): VerificationResult {
  const ddd = parseInt(digits.slice(0, 2));
  const isValidDDD = validDDDs.has(ddd);
  const isMobile = digits.length === 11 && digits[2] === "9";
  const isValidFormat = digits.length >= 10 && digits.length <= 11;

  const validNumber = isValidDDD && isValidFormat;

  // Simulate WhatsApp: mobile numbers with valid DDD have high chance
  const whatsappActive = validNumber && isMobile && Math.random() > 0.15;

  // Simulate spam: most numbers are clean
  const spamRand = Math.random();
  const spamReputation: "clean" | "suspect" | "spam" =
    spamRand > 0.85 ? "spam" : spamRand > 0.7 ? "suspect" : "clean";

  // Simulate blacklist: very rare
  const blacklisted = Math.random() > 0.92;

  return {
    whatsappActive,
    validNumber,
    spamReputation,
    blacklisted,
    details: {
      carrier: carriers[Math.floor(Math.random() * carriers.length)],
      region: getRegion(ddd),
      numberType: isMobile ? "Celular" : "Fixo",
      spamReports: spamReputation === "spam" ? Math.floor(Math.random() * 50) + 10 :
                   spamReputation === "suspect" ? Math.floor(Math.random() * 10) + 1 : 0,
    },
  };
}
