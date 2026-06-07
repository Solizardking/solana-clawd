import { db } from "./db/index";
import { product } from "./db/schema";

const PRODUCTS = [
  {
    id: "prod_ethiopian",
    name: "Ethiopian Yirgacheffe",
    slug: "ethiopian-yirgacheffe",
    description:
      "Bright and complex with floral and citrus notes. Grown at high altitudes in the birthplace of coffee.",
    priceCents: 1800,
    origin: "Yirgacheffe, Ethiopia",
    roastLevel: "Light",
  },
  {
    id: "prod_colombian",
    name: "Colombian Supremo",
    slug: "colombian-supremo",
    description:
      "Smooth and balanced with nutty undertones and a rich chocolate finish. A crowd favorite.",
    priceCents: 1500,
    origin: "Huila, Colombia",
    roastLevel: "Medium",
  },
  {
    id: "prod_sumatra",
    name: "Sumatra Mandheling",
    slug: "sumatra-mandheling",
    description:
      "Full-bodied and earthy with low acidity. Deep, bold flavors with herbal and spice notes.",
    priceCents: 2000,
    origin: "Mandheling, Sumatra",
    roastLevel: "Dark",
  },
  {
    id: "prod_guatemala",
    name: "Guatemala Antigua",
    slug: "guatemala-antigua",
    description:
      "Rich and velvety with smoky, spicy characteristics. Grown in volcanic soil near Antigua.",
    priceCents: 1700,
    origin: "Antigua, Guatemala",
    roastLevel: "Medium",
  },
  {
    id: "prod_kenya",
    name: "Kenya AA",
    slug: "kenya-aa",
    description:
      "Vibrant and fruity with wine-like acidity. Kenya's highest grade beans with bright berry notes.",
    priceCents: 2200,
    origin: "Nyeri, Kenya",
    roastLevel: "Light",
  },
];

async function seed() {
  console.log("Seeding products...");

  for (const p of PRODUCTS) {
    await db
      .insert(product)
      .values(p)
      .onConflictDoUpdate({
        target: product.id,
        set: {
          name: p.name,
          description: p.description,
          priceCents: p.priceCents,
          origin: p.origin,
          roastLevel: p.roastLevel,
        },
      });
    console.log(`  ✓ ${p.name} — $${(p.priceCents / 100).toFixed(2)}`);
  }

  console.log("Done.");
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
