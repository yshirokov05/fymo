FEDERAL_TAX_BRACKETS = {
    2025: {
        'single': {
            'deduction': 15750,
            'brackets': [
                {'rate': 0.10, 'up_to': 11925},
                {'rate': 0.12, 'up_to': 48475},
                {'rate': 0.22, 'up_to': 103350},
                {'rate': 0.24, 'up_to': 197300},
                {'rate': 0.32, 'up_to': 250525},
                {'rate': 0.35, 'up_to': 626350},
                {'rate': 0.37, 'up_to': float('inf')}
            ]
        },
        'married_filing_jointly': {
            'deduction': 31500,
            'brackets': [
                {'rate': 0.10, 'up_to': 23850},
                {'rate': 0.12, 'up_to': 96950},
                {'rate': 0.22, 'up_to': 206700},
                {'rate': 0.24, 'up_to': 394600},
                {'rate': 0.32, 'up_to': 501050},
                {'rate': 0.35, 'up_to': 751600},
                {'rate': 0.37, 'up_to': float('inf')}
            ]
        },
        'head_of_household': {
            'deduction': 23625,
            'brackets': [
                {'rate': 0.10, 'up_to': 17000},
                {'rate': 0.12, 'up_to': 64850},
                {'rate': 0.22, 'up_to': 103350},
                {'rate': 0.24, 'up_to': 197300},
                {'rate': 0.32, 'up_to': 250500},
                {'rate': 0.35, 'up_to': 626350},
                {'rate': 0.37, 'up_to': float('inf')}
            ]
        },
        'married_filing_separately': {
            'deduction': 15750,
            'brackets': [
                {'rate': 0.10, 'up_to': 11925},
                {'rate': 0.12, 'up_to': 48475},
                {'rate': 0.22, 'up_to': 103350},
                {'rate': 0.24, 'up_to': 197300},
                {'rate': 0.32, 'up_to': 250525},
                {'rate': 0.35, 'up_to': 313175},
                {'rate': 0.37, 'up_to': float('inf')}
            ]
        }
    },
    2026: {
        'single': {
            'deduction': 16100,
            'brackets': [
                {'rate': 0.10, 'up_to': 12400},
                {'rate': 0.12, 'up_to': 50400},
                {'rate': 0.22, 'up_to': 105700},
                {'rate': 0.24, 'up_to': 201775},
                {'rate': 0.32, 'up_to': 256225},
                {'rate': 0.35, 'up_to': 640600},
                {'rate': 0.37, 'up_to': float('inf')}
            ]
        },
        'married_filing_jointly': {
            'deduction': 32200,
            'brackets': [
                {'rate': 0.10, 'up_to': 24800},
                {'rate': 0.12, 'up_to': 100800},
                {'rate': 0.22, 'up_to': 211400},
                {'rate': 0.24, 'up_to': 403550},
                {'rate': 0.32, 'up_to': 512450},
                {'rate': 0.35, 'up_to': 768700},
                {'rate': 0.37, 'up_to': float('inf')}
            ]
        },
        'head_of_household': {
            'deduction': 24150,
            'brackets': [
                {'rate': 0.10, 'up_to': 17700},
                {'rate': 0.12, 'up_to': 67500},
                {'rate': 0.22, 'up_to': 105700},
                {'rate': 0.24, 'up_to': 201750},
                {'rate': 0.32, 'up_to': 256200},
                {'rate': 0.35, 'up_to': 640600},
                {'rate': 0.37, 'up_to': float('inf')}
            ]
        },
        'married_filing_separately': {
            'deduction': 16100,
            'brackets': [
                {'rate': 0.10, 'up_to': 12400},
                {'rate': 0.12, 'up_to': 50400},
                {'rate': 0.22, 'up_to': 105700},
                {'rate': 0.24, 'up_to': 201775},
                {'rate': 0.32, 'up_to': 256225},
                {'rate': 0.35, 'up_to': 384350},
                {'rate': 0.37, 'up_to': float('inf')}
            ]
        }
    }
}
# Qualifying widow usually uses MFJ brackets
FEDERAL_TAX_BRACKETS[2025]['qualifying_widow'] = FEDERAL_TAX_BRACKETS[2025]['married_filing_jointly']
FEDERAL_TAX_BRACKETS[2026]['qualifying_widow'] = FEDERAL_TAX_BRACKETS[2026]['married_filing_jointly']

STATE_TAX_BRACKETS_2026 = {
    'AL': {
        'single': {'deduction': 2500, 'brackets': [{'rate': 0.02, 'up_to': 500}, {'rate': 0.04, 'up_to': 3000}, {'rate': 0.05, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 5000, 'brackets': [{'rate': 0.02, 'up_to': 1000}, {'rate': 0.04, 'up_to': 6000}, {'rate': 0.05, 'up_to': float('inf')}]}
    },
    'AK': {'single': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}},
    'AZ': {
        'single': {'deduction': 13850, 'brackets': [{'rate': 0.025, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 27700, 'brackets': [{'rate': 0.025, 'up_to': float('inf')}]}
    },
    'AR': {
        'single': {'deduction': 2340, 'brackets': [{'rate': 0.02, 'up_to': 4300}, {'rate': 0.04, 'up_to': 8500}, {'rate': 0.044, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 4680, 'brackets': [{'rate': 0.02, 'up_to': 4300}, {'rate': 0.04, 'up_to': 8500}, {'rate': 0.044, 'up_to': float('inf')}]}
    },
    'CA': {
        'single': {
            'deduction': 5363, 
            'brackets': [
                {'rate': 0.01, 'up_to': 10412}, {'rate': 0.02, 'up_to': 24684}, {'rate': 0.04, 'up_to': 38959}, 
                {'rate': 0.06, 'up_to': 54081}, {'rate': 0.08, 'up_to': 68350}, {'rate': 0.093, 'up_to': 349137}, 
                {'rate': 0.103, 'up_to': 418961}, {'rate': 0.113, 'up_to': 698271}, {'rate': 0.123, 'up_to': float('inf')}
            ],
            'mental_health_tax_rate': 0.01, 'mental_health_tax_threshold': 1000000
        },
        'married_filing_jointly': {
            'deduction': 10726,
            'brackets': [
                {'rate': 0.01, 'up_to': 20824}, {'rate': 0.02, 'up_to': 49368}, {'rate': 0.04, 'up_to': 77918}, 
                {'rate': 0.06, 'up_to': 108162}, {'rate': 0.08, 'up_to': 136700}, {'rate': 0.093, 'up_to': 698274}, 
                {'rate': 0.103, 'up_to': 837922}, {'rate': 0.113, 'up_to': 1396542}, {'rate': 0.123, 'up_to': float('inf')}
            ],
            'mental_health_tax_rate': 0.01, 'mental_health_tax_threshold': 1000000
        }
    },
    'CO': {'single': {'deduction': 13850, 'brackets': [{'rate': 0.044, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 27700, 'brackets': [{'rate': 0.044, 'up_to': float('inf')}]}},
    'CT': {
        'single': {'deduction': 15000, 'brackets': [{'rate': 0.03, 'up_to': 10000}, {'rate': 0.05, 'up_to': 50000}, {'rate': 0.055, 'up_to': 100000}, {'rate': 0.06, 'up_to': 200000}, {'rate': 0.065, 'up_to': 250000}, {'rate': 0.069, 'up_to': 500000}, {'rate': 0.0699, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 24000, 'brackets': [{'rate': 0.03, 'up_to': 20000}, {'rate': 0.05, 'up_to': 100000}, {'rate': 0.055, 'up_to': 200000}, {'rate': 0.06, 'up_to': 400000}, {'rate': 0.065, 'up_to': 500000}, {'rate': 0.069, 'up_to': 1000000}, {'rate': 0.0699, 'up_to': float('inf')}]}
    },
    'DE': {
        'single': {'deduction': 3250, 'brackets': [{'rate': 0, 'up_to': 2000}, {'rate': 0.022, 'up_to': 5000}, {'rate': 0.039, 'up_to': 10000}, {'rate': 0.048, 'up_to': 20000}, {'rate': 0.052, 'up_to': 25000}, {'rate': 0.0555, 'up_to': 60000}, {'rate': 0.066, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 6500, 'brackets': [{'rate': 0, 'up_to': 2000}, {'rate': 0.022, 'up_to': 5000}, {'rate': 0.039, 'up_to': 10000}, {'rate': 0.048, 'up_to': 20000}, {'rate': 0.052, 'up_to': 25000}, {'rate': 0.0555, 'up_to': 60000}, {'rate': 0.066, 'up_to': float('inf')}]}
    },
    'DC': {
        'single': {'deduction': 13850, 'brackets': [{'rate': 0.04, 'up_to': 10000}, {'rate': 0.06, 'up_to': 40000}, {'rate': 0.065, 'up_to': 60000}, {'rate': 0.085, 'up_to': 250000}, {'rate': 0.0925, 'up_to': 500000}, {'rate': 0.0975, 'up_to': 1000000}, {'rate': 0.1075, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 27700, 'brackets': [{'rate': 0.04, 'up_to': 10000}, {'rate': 0.06, 'up_to': 40000}, {'rate': 0.065, 'up_to': 60000}, {'rate': 0.085, 'up_to': 250000}, {'rate': 0.0925, 'up_to': 500000}, {'rate': 0.0975, 'up_to': 1000000}, {'rate': 0.1075, 'up_to': float('inf')}]}
    },
    'FL': {'single': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}},
    'GA': {'single': {'deduction': 12000, 'brackets': [{'rate': 0.0549, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 18500, 'brackets': [{'rate': 0.0549, 'up_to': float('inf')}]}},
    'HI': {
        'single': {'deduction': 2200, 'brackets': [{'rate': 0.014, 'up_to': 2400}, {'rate': 0.032, 'up_to': 4800}, {'rate': 0.055, 'up_to': 9600}, {'rate': 0.064, 'up_to': 14400}, {'rate': 0.068, 'up_to': 19200}, {'rate': 0.072, 'up_to': 24000}, {'rate': 0.076, 'up_to': 36000}, {'rate': 0.079, 'up_to': 48000}, {'rate': 0.0825, 'up_to': 150000}, {'rate': 0.09, 'up_to': 175000}, {'rate': 0.10, 'up_to': 200000}, {'rate': 0.11, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 4400, 'brackets': [{'rate': 0.014, 'up_to': 4800}, {'rate': 0.032, 'up_to': 9600}, {'rate': 0.055, 'up_to': 19200}, {'rate': 0.064, 'up_to': 28800}, {'rate': 0.068, 'up_to': 38400}, {'rate': 0.072, 'up_to': 48000}, {'rate': 0.076, 'up_to': 72000}, {'rate': 0.079, 'up_to': 96000}, {'rate': 0.0825, 'up_to': 300000}, {'rate': 0.09, 'up_to': 350000}, {'rate': 0.10, 'up_to': 400000}, {'rate': 0.11, 'up_to': float('inf')}]}
    },
    'ID': {'single': {'deduction': 13850, 'brackets': [{'rate': 0.058, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 27700, 'brackets': [{'rate': 0.058, 'up_to': float('inf')}]}},
    'IL': {'single': {'deduction': 2775, 'brackets': [{'rate': 0.0495, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 5550, 'brackets': [{'rate': 0.0495, 'up_to': float('inf')}]}},
    'IN': {'single': {'deduction': 1000, 'brackets': [{'rate': 0.0305, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 2000, 'brackets': [{'rate': 0.0305, 'up_to': float('inf')}]}},
    'IA': {'single': {'deduction': 13850, 'brackets': [{'rate': 0.057, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 27700, 'brackets': [{'rate': 0.057, 'up_to': float('inf')}]}},
    'KS': {
        'single': {'deduction': 3500, 'brackets': [{'rate': 0.031, 'up_to': 15000}, {'rate': 0.0525, 'up_to': 30000}, {'rate': 0.057, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 8000, 'brackets': [{'rate': 0.031, 'up_to': 30000}, {'rate': 0.0525, 'up_to': 60000}, {'rate': 0.057, 'up_to': float('inf')}]}
    },
    'KY': {'single': {'deduction': 2980, 'brackets': [{'rate': 0.04, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 2980, 'brackets': [{'rate': 0.04, 'up_to': float('inf')}]}},
    'LA': {
        'single': {'deduction': 4500, 'brackets': [{'rate': 0.0185, 'up_to': 12500}, {'rate': 0.035, 'up_to': 50000}, {'rate': 0.0425, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 9000, 'brackets': [{'rate': 0.0185, 'up_to': 25000}, {'rate': 0.035, 'up_to': 100000}, {'rate': 0.0425, 'up_to': float('inf')}]}
    },
    'ME': {
        'single': {'deduction': 13850, 'brackets': [{'rate': 0.058, 'up_to': 26050}, {'rate': 0.0675, 'up_to': 61600}, {'rate': 0.0715, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 27700, 'brackets': [{'rate': 0.058, 'up_to': 52100}, {'rate': 0.0675, 'up_to': 123250}, {'rate': 0.0715, 'up_to': float('inf')}]}
    },
    'MD': {
        'single': {'deduction': 2550, 'brackets': [{'rate': 0.02, 'up_to': 1000}, {'rate': 0.03, 'up_to': 2000}, {'rate': 0.04, 'up_to': 3000}, {'rate': 0.0475, 'up_to': 100000}, {'rate': 0.05, 'up_to': 125000}, {'rate': 0.0525, 'up_to': 150000}, {'rate': 0.055, 'up_to': 250000}, {'rate': 0.0575, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 5100, 'brackets': [{'rate': 0.02, 'up_to': 1000}, {'rate': 0.03, 'up_to': 2000}, {'rate': 0.04, 'up_to': 3000}, {'rate': 0.0475, 'up_to': 150000}, {'rate': 0.05, 'up_to': 175000}, {'rate': 0.0525, 'up_to': 225000}, {'rate': 0.055, 'up_to': 300000}, {'rate': 0.0575, 'up_to': float('inf')}]}
    },
    'MA': {'single': {'deduction': 4400, 'brackets': [{'rate': 0.05, 'up_to': 1000000}, {'rate': 0.09, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 8800, 'brackets': [{'rate': 0.05, 'up_to': 1000000}, {'rate': 0.09, 'up_to': float('inf')}]}},
    'MI': {'single': {'deduction': 5600, 'brackets': [{'rate': 0.0425, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 11200, 'brackets': [{'rate': 0.0425, 'up_to': float('inf')}]}},
    'MN': {
        'single': {'deduction': 13825, 'brackets': [{'rate': 0.0535, 'up_to': 30070}, {'rate': 0.068, 'up_to': 98760}, {'rate': 0.0785, 'up_to': 183340}, {'rate': 0.0985, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 27650, 'brackets': [{'rate': 0.0535, 'up_to': 43960}, {'rate': 0.068, 'up_to': 174610}, {'rate': 0.0785, 'up_to': 304970}, {'rate': 0.0985, 'up_to': float('inf')}]}
    },
    'MS': {'single': {'deduction': 2300, 'brackets': [{'rate': 0.047, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 4600, 'brackets': [{'rate': 0.047, 'up_to': float('inf')}]}},
    'MO': {'single': {'deduction': 13850, 'brackets': [{'rate': 0.015, 'up_to': 1273}, {'rate': 0.0495, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 27700, 'brackets': [{'rate': 0.015, 'up_to': 1273}, {'rate': 0.0495, 'up_to': float('inf')}]}},
    'MT': {'single': {'deduction': 13850, 'brackets': [{'rate': 0.047, 'up_to': 20500}, {'rate': 0.059, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 27700, 'brackets': [{'rate': 0.047, 'up_to': 41000}, {'rate': 0.059, 'up_to': float('inf')}]}},
    'NE': {'single': {'deduction': 7900, 'brackets': [{'rate': 0.0246, 'up_to': 3700}, {'rate': 0.0351, 'up_to': 22130}, {'rate': 0.0501, 'up_to': 35730}, {'rate': 0.0584, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 15800, 'brackets': [{'rate': 0.0246, 'up_to': 7400}, {'rate': 0.0351, 'up_to': 44260}, {'rate': 0.0501, 'up_to': 71460}, {'rate': 0.0584, 'up_to': float('inf')}]}},
    'NV': {'single': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}},
    'NH': {'single': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}},
    'NJ': {
        'single': {'deduction': 0, 'brackets': [{'rate': 0.014, 'up_to': 20000}, {'rate': 0.0175, 'up_to': 35000}, {'rate': 0.035, 'up_to': 40000}, {'rate': 0.05525, 'up_to': 75000}, {'rate': 0.0637, 'up_to': 500000}, {'rate': 0.0897, 'up_to': 1000000}, {'rate': 0.1075, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0.014, 'up_to': 20000}, {'rate': 0.0175, 'up_to': 50000}, {'rate': 0.0245, 'up_to': 70000}, {'rate': 0.035, 'up_to': 80000}, {'rate': 0.05525, 'up_to': 150000}, {'rate': 0.0637, 'up_to': 500000}, {'rate': 0.0897, 'up_to': 1000000}, {'rate': 0.1075, 'up_to': float('inf')}]}
    },
    'NM': {
        'single': {'deduction': 13850, 'brackets': [{'rate': 0.017, 'up_to': 5500}, {'rate': 0.032, 'up_to': 11000}, {'rate': 0.047, 'up_to': 16000}, {'rate': 0.049, 'up_to': 210000}, {'rate': 0.059, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 27700, 'brackets': [{'rate': 0.017, 'up_to': 8000}, {'rate': 0.032, 'up_to': 16000}, {'rate': 0.047, 'up_to': 24000}, {'rate': 0.049, 'up_to': 315000}, {'rate': 0.059, 'up_to': float('inf')}]}
    },
    'NY': {
        'single': {'deduction': 8000, 'brackets': [{'rate': 0.04, 'up_to': 8500}, {'rate': 0.045, 'up_to': 11700}, {'rate': 0.0525, 'up_to': 13900}, {'rate': 0.055, 'up_to': 21400}, {'rate': 0.0585, 'up_to': 80650}, {'rate': 0.0625, 'up_to': 215400}, {'rate': 0.0685, 'up_to': 1077550}, {'rate': 0.0965, 'up_to': 5000000}, {'rate': 0.103, 'up_to': 25000000}, {'rate': 0.109, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 16050, 'brackets': [{'rate': 0.04, 'up_to': 17150}, {'rate': 0.045, 'up_to': 23600}, {'rate': 0.0525, 'up_to': 27900}, {'rate': 0.055, 'up_to': 43000}, {'rate': 0.0585, 'up_to': 161550}, {'rate': 0.0625, 'up_to': 323200}, {'rate': 0.0685, 'up_to': 2155350}, {'rate': 0.0965, 'up_to': 5000000}, {'rate': 0.103, 'up_to': 25000000}, {'rate': 0.109, 'up_to': float('inf')}]}
    },
    'NC': {'single': {'deduction': 12750, 'brackets': [{'rate': 0.045, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 25500, 'brackets': [{'rate': 0.045, 'up_to': float('inf')}]}},
    'ND': {'single': {'deduction': 13850, 'brackets': [{'rate': 0.011, 'up_to': 44725}, {'rate': 0.0204, 'up_to': 108200}, {'rate': 0.0227, 'up_to': 225950}, {'rate': 0.0264, 'up_to': 491350}, {'rate': 0.029, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 27700, 'brackets': [{'rate': 0.011, 'up_to': 74750}, {'rate': 0.0204, 'up_to': 180800}, {'rate': 0.0227, 'up_to': 275550}, {'rate': 0.0264, 'up_to': 491350}, {'rate': 0.029, 'up_to': float('inf')}]}},
    'OH': {'single': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': 26050}, {'rate': 0.0275, 'up_to': 100000}, {'rate': 0.035, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': 26050}, {'rate': 0.0275, 'up_to': 100000}, {'rate': 0.035, 'up_to': float('inf')}]}},
    'OK': {'single': {'deduction': 6350, 'brackets': [{'rate': 0.0025, 'up_to': 1000}, {'rate': 0.0075, 'up_to': 2500}, {'rate': 0.0175, 'up_to': 3750}, {'rate': 0.0275, 'up_to': 4900}, {'rate': 0.0375, 'up_to': 7200}, {'rate': 0.0475, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 12700, 'brackets': [{'rate': 0.0025, 'up_to': 2000}, {'rate': 0.0075, 'up_to': 5000}, {'rate': 0.0175, 'up_to': 7500}, {'rate': 0.0275, 'up_to': 9800}, {'rate': 0.0375, 'up_to': 12200}, {'rate': 0.0475, 'up_to': float('inf')}]}},
    'OR': {
        'single': {'deduction': 2605, 'brackets': [{'rate': 0.0475, 'up_to': 4050}, {'rate': 0.0675, 'up_to': 10200}, {'rate': 0.0875, 'up_to': 125000}, {'rate': 0.099, 'up_to': float('inf')}]},
        'married_filing_jointly': {'deduction': 5210, 'brackets': [{'rate': 0.0475, 'up_to': 8100}, {'rate': 0.0675, 'up_to': 20400}, {'rate': 0.0875, 'up_to': 250000}, {'rate': 0.099, 'up_to': float('inf')}]}
    },
    'PA': {'single': {'deduction': 0, 'brackets': [{'rate': 0.0307, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0.0307, 'up_to': float('inf')}]}},
    'RI': {'single': {'deduction': 10025, 'brackets': [{'rate': 0.0375, 'up_to': 74150}, {'rate': 0.0475, 'up_to': 168600}, {'rate': 0.0599, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 20050, 'brackets': [{'rate': 0.0375, 'up_to': 74150}, {'rate': 0.0475, 'up_to': 168600}, {'rate': 0.0599, 'up_to': float('inf')}]}},
    'SC': {'single': {'deduction': 13850, 'brackets': [{'rate': 0, 'up_to': 3460}, {'rate': 0.03, 'up_to': 17330}, {'rate': 0.064, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 27700, 'brackets': [{'rate': 0, 'up_to': 3460}, {'rate': 0.03, 'up_to': 17330}, {'rate': 0.064, 'up_to': float('inf')}]}},
    'SD': {'single': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}},
    'TN': {'single': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}},
    'TX': {'single': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}},
    'UT': {'single': {'deduction': 0, 'brackets': [{'rate': 0.0465, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0.0465, 'up_to': float('inf')}]}},
    'VT': {'single': {'deduction': 6850, 'brackets': [{'rate': 0.0335, 'up_to': 43900}, {'rate': 0.066, 'up_to': 106550}, {'rate': 0.076, 'up_to': 222150}, {'rate': 0.0875, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 13700, 'brackets': [{'rate': 0.0335, 'up_to': 73350}, {'rate': 0.066, 'up_to': 177050}, {'rate': 0.076, 'up_to': 269750}, {'rate': 0.0875, 'up_to': float('inf')}]}},
    'VA': {'single': {'deduction': 8000, 'brackets': [{'rate': 0.02, 'up_to': 3000}, {'rate': 0.03, 'up_to': 5000}, {'rate': 0.05, 'up_to': 17000}, {'rate': 0.0575, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 16000, 'brackets': [{'rate': 0.02, 'up_to': 3000}, {'rate': 0.03, 'up_to': 5000}, {'rate': 0.05, 'up_to': 17000}, {'rate': 0.0575, 'up_to': float('inf')}]}},
    'WA': {'single': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}},
    'WV': {'single': {'deduction': 0, 'brackets': [{'rate': 0.0236, 'up_to': 10000}, {'rate': 0.0315, 'up_to': 25000}, {'rate': 0.0354, 'up_to': 40000}, {'rate': 0.0472, 'up_to': 60000}, {'rate': 0.0512, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0.0236, 'up_to': 20000}, {'rate': 0.0315, 'up_to': 50000}, {'rate': 0.0354, 'up_to': 80000}, {'rate': 0.0472, 'up_to': 120000}, {'rate': 0.0512, 'up_to': float('inf')}]}},
    'WI': {'single': {'deduction': 11970, 'brackets': [{'rate': 0.035, 'up_to': 14320}, {'rate': 0.044, 'up_to': 28640}, {'rate': 0.053, 'up_to': 315310}, {'rate': 0.0765, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 23940, 'brackets': [{'rate': 0.035, 'up_to': 19090}, {'rate': 0.044, 'up_to': 38190}, {'rate': 0.053, 'up_to': 420420}, {'rate': 0.0765, 'up_to': float('inf')}]}},
    'WY': {'single': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}, 'married_filing_jointly': {'deduction': 0, 'brackets': [{'rate': 0, 'up_to': float('inf')}]}}
}

# For state brackets, we will use 2026 data as a proxy for 2025 unless major changes are known.
STATE_TAX_BRACKETS = {
    2025: STATE_TAX_BRACKETS_2026, # Proxy
    2026: STATE_TAX_BRACKETS_2026
}

# Apply fallbacks/copies for other status types for all states
for year in STATE_TAX_BRACKETS:
    for state_code in STATE_TAX_BRACKETS[year]:
        if 'married_filing_separately' not in STATE_TAX_BRACKETS[year][state_code]:
            STATE_TAX_BRACKETS[year][state_code]['married_filing_separately'] = STATE_TAX_BRACKETS[year][state_code]['single']
        if 'head_of_household' not in STATE_TAX_BRACKETS[year][state_code]:
            STATE_TAX_BRACKETS[year][state_code]['head_of_household'] = STATE_TAX_BRACKETS[year][state_code]['single']
        if 'qualifying_widow' not in STATE_TAX_BRACKETS[year][state_code]:
            STATE_TAX_BRACKETS[year][state_code]['qualifying_widow'] = STATE_TAX_BRACKETS[year][state_code]['married_filing_jointly']

# CA Specific Overrides for HOH/Separated if known distinct
for year in STATE_TAX_BRACKETS:
    STATE_TAX_BRACKETS[year]['CA']['married_filing_separately'] = STATE_TAX_BRACKETS[year]['CA']['single']
    STATE_TAX_BRACKETS[year]['CA']['qualifying_widow'] = STATE_TAX_BRACKETS[year]['CA']['married_filing_jointly']

def calculate_federal_tax(income, filing_status='single', year=2026):
    """
    Calculates the federal tax for a given income, filing status, and year.
    """
    year_brackets = FEDERAL_TAX_BRACKETS.get(year, FEDERAL_TAX_BRACKETS[2026])
    
    if filing_status not in year_brackets:
        status_brackets = year_brackets.get('single')
    else:
        status_brackets = year_brackets[filing_status]

    taxable_income = max(0, income - status_brackets['deduction'])
    
    tax = 0
    previous_bracket_limit = 0
    
    for bracket in status_brackets['brackets']:
        if taxable_income == 0:
            break
            
        bracket_limit = bracket['up_to']
        rate = bracket['rate']
        
        if taxable_income > bracket_limit:
            tax += (bracket_limit - previous_bracket_limit) * rate
            previous_bracket_limit = bracket_limit
        else:
            tax += (taxable_income - previous_bracket_limit) * rate
            break
            
    return tax

def calculate_state_tax(income, state='CA', filing_status='single', year=2026):
    """
    Calculates the state tax for a given income, state, filing status, and year.
    """
    year_brackets = STATE_TAX_BRACKETS.get(year, STATE_TAX_BRACKETS[2026])
    
    if state not in year_brackets:
        return 0
    
    if filing_status not in year_brackets[state]:
        state_brackets = year_brackets[state].get('single')
    else:
        state_brackets = year_brackets[state][filing_status]

    taxable_income = max(0, income - state_brackets['deduction'])
    
    tax = 0
    previous_bracket_limit = 0
    
    for bracket in state_brackets['brackets']:
        if taxable_income == 0:
            break
            
        bracket_limit = bracket['up_to']
        rate = bracket['rate']
        
        if taxable_income > bracket_limit:
            tax += (bracket_limit - previous_bracket_limit) * rate
            previous_bracket_limit = bracket_limit
        else:
            tax += (taxable_income - previous_bracket_limit) * rate
            break

    # Apply mental health services tax (Specific to CA)
    if 'mental_health_tax_threshold' in state_brackets and taxable_income > state_brackets['mental_health_tax_threshold']:
        tax += (taxable_income - state_brackets['mental_health_tax_threshold']) * state_brackets['mental_health_tax_rate']
            
    return tax

def calculate_fica_tax(income, filing_status='single', year=2026):
    """
    Calculates FICA taxes (Social Security and Medicare) for a given year.
    """
    # 2025 and 2026 use the same SS wage base for now in our data
    ss_cap = 176100
    ss_rate = 0.062
    ss_tax = min(income, ss_cap) * ss_rate

    medicare_rate = 0.0145
    medicare_tax = income * medicare_rate

    add_medicare_rate = 0.009
    if filing_status == 'married_filing_jointly':
        threshold = 250000
    elif filing_status == 'married_filing_separately':
        threshold = 125000
    else:
        threshold = 200000

    add_medicare_tax = max(0, income - threshold) * add_medicare_rate

    return ss_tax + medicare_tax + add_medicare_tax

def calculate_taxes(state_name, incomes, filing_status='single', year=2026):
    """
    Bridge function for the AI Advisor to get quick tax estimates.
    """
    total_gross = sum(float(getattr(i, 'amount', 0)) for i in incomes if not getattr(i, 'is_net', False))
    fed = calculate_federal_tax(total_gross, filing_status, year)
    state = calculate_state_tax(total_gross, state_name, filing_status, year)
    fica = calculate_fica_tax(total_gross, filing_status, year)
    return {
        "federal_tax": fed,
        "state_tax": state,
        "fica_tax": fica,
        "total_tax": fed + state + fica
    }
