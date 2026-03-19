import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Phone } from "lucide-react";

interface PhoneInputProps {
  onVerify: (phone: string) => void;
  isLoading: boolean;
}

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

const PhoneInput = ({ onVerify, isLoading }: PhoneInputProps) => {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const digits = phone.replace(/\D/g, "");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
    setPhone(formatPhone(raw));
    setError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (digits.length < 10 || digits.length > 11) {
      setError("Digite um número válido com DDD (10 ou 11 dígitos)");
      return;
    }
    onVerify(digits);
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md flex flex-col items-center gap-5"
    >
      <div className="glass-card p-8 w-full space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Phone className="w-8 h-8 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Digite o número de telefone que deseja verificar
          </p>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
              +55
            </span>
            <input
              type="tel"
              value={phone}
              onChange={handleChange}
              placeholder="(11) 99999-9999"
              className="w-full h-14 pl-14 pr-4 rounded-xl bg-secondary border border-border text-foreground text-lg font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
              disabled={isLoading}
              autoFocus
            />
          </div>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-destructive pl-1"
            >
              {error}
            </motion.p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || digits.length < 10}
          className="w-full h-13 py-3.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:brightness-110 transition-all glow-green-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <>
              <Search className="w-5 h-5" />
              Verificar Número
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-muted-foreground text-center max-w-sm">
        Funciona com números brasileiros. O número não é armazenado.
      </p>
    </motion.form>
  );
};

export default PhoneInput;
