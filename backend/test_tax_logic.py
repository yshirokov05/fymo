from tax_logic import calculate_federal_tax, calculate_fica_tax

def test_federal_tax_2025():
    # Single 2025: $50,000 income
    # Deduction: $15,750
    # Taxable: $34,250
    # 10% up to $11,925 = $1,192.50
    # 12% on ($34,250 - $11,925) = 0.12 * $22,325 = $2,679.00
    # Total: $3,871.50
    tax = calculate_federal_tax(50000, filing_status='single', year=2025)
    assert round(tax, 2) == 3871.50

def test_federal_tax_2026():
    # Single 2026: $50,000 income
    # Deduction: $16,100
    # Taxable: $33,900
    # 10% up to $12,400 = $1,240.00
    # 12% on ($33,900 - $12,400) = 0.12 * $21,500 = $2,580.00
    # Total: $3,820.00
    tax = calculate_federal_tax(50000, filing_status='single', year=2026)
    assert round(tax, 2) == 3820.00

def test_fica_tax():
    # $50,000 income
    # SS: 0.062 * 50000 = 3100
    # Medicare: 0.0145 * 50000 = 725
    # Total: 3825
    fica = calculate_fica_tax(50000)
    assert round(fica, 2) == 3825.00

if __name__ == "__main__":
    test_federal_tax_2025()
    test_federal_tax_2026()
    test_fica_tax()
    print("All tests passed!")
