from PIL import Image, ImageDraw, ImageFont

# Create a blank white image
img = Image.new('RGB', (800, 600), color='white')
d = ImageDraw.Draw(img)

# Try to use a default font
try:
    font = ImageFont.truetype("arial.ttf", 20)
    title_font = ImageFont.truetype("arial.ttf", 36)
except IOError:
    font = ImageFont.load_default()
    title_font = font

# Add text to the image
d.text((50, 50), "GEICO Auto Insurance Policy", fill=(0, 0, 0), font=title_font)
d.text((50, 120), "Policyholder: Mr. Yuri Bean", fill=(0, 0, 0), font=font)
d.text((50, 160), "Vehicle: 2024 Tesla Model 3", fill=(0, 0, 0), font=font)
d.text((50, 200), "Premium: $120.50 / MONTHLY", fill=(0, 0, 0), font=font)
d.text((50, 240), "Deductible: $500", fill=(0, 0, 0), font=font)

d.text((50, 300), "Coverage Limits:", fill=(0, 0, 0), font=font)
d.text((70, 330), "- Bodily Injury Liability: $250,000 / $500,000", fill=(0, 0, 0), font=font)
d.text((70, 360), "- Property Damage Liability: $100,000", fill=(0, 0, 0), font=font)
d.text((70, 390), "- Uninsured Motorist: $100,000", fill=(0, 0, 0), font=font)
d.text((70, 420), "- Comprehensive & Collision: Actual Cash Value", fill=(0, 0, 0), font=font)

d.text((50, 480), "Exclusions: Commercial use, rideshare driving.", fill=(255, 0, 0), font=font)
d.text((50, 520), "Valid through: 12/31/2026", fill=(0, 0, 0), font=font)

# Save the image
img.save('C:/Projects/Personal-Finance-App-PFA/mock_insurance_policy.png')
print("Mock policy created at C:/Projects/Personal-Finance-App-PFA/mock_insurance_policy.png")
