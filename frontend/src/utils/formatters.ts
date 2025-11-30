export function formatCurrency(value: number) {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatAccountType(value: string) {
  const map: Record<string, string> = {
    chequing: "Chequing",
    savings: "Savings",
    cash: "Cash",
    credit: "Credit Card",
    line_of_credit: "Line of Credit",
    tfsa: "TFSA",
    rrsp: "RRSP",
    rsp: "RSP",
    resp: "RESP",
    brokerage: "Brokerage/Investment",
    investment: "Other Investment",
    fhsa: "FHSA",
    loan: "Loan/Mortgage",
  };
  return map[value] ?? value;
}
