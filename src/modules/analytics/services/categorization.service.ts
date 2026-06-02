import { Injectable, NotFoundException } from '@nestjs/common';
import { SpendingCategory, TransactionType } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';

type RuleEntry = [string[], SpendingCategory];

const MERCHANT_RULES: RuleEntry[] = [
  [
    ['starbucks', 'kfc', 'mcdonald', 'pizza', 'restaurant', 'cafe', 'bistro', 'diner', 'bakery',
     'sushi', 'burger', 'grill', 'eatery', 'food court', 'canteen', 'buffet'],
    SpendingCategory.FOOD_AND_DINING,
  ],
  [
    ['supermarket', 'grocery', 'carrefour', 'walmart', 'costco', 'spar', 'nakumatt', 'tuskys',
     'quickmart', 'fresh market', 'green market', 'food store', 'minimart'],
    SpendingCategory.GROCERIES,
  ],
  [
    ['uber', 'lyft', 'safeboda', 'bolt', 'taxi', 'moto', 'twende', 'bus', 'transit', 'metro',
     'railway', 'airline', 'flight', 'car hire', 'car rental', 'parking', 'fuel', 'petrol'],
    SpendingCategory.TRANSPORT,
  ],
  [
    ['amazon', 'jumia', 'mall', 'clothing', 'apparel', 'fashion', 'boutique', 'ebay',
     'aliexpress', 'konga', 'shop', 'outlet', 'brand store', 'online store'],
    SpendingCategory.SHOPPING,
  ],
  [
    ['cinema', 'movie', 'theatre', 'concert', 'festival', 'nightclub', 'bar', 'gaming',
     'playstation', 'xbox', 'stadium', 'arcade', 'amusement', 'bowling'],
    SpendingCategory.ENTERTAINMENT,
  ],
  [
    ['netflix', 'spotify', 'youtube premium', 'amazon prime', 'hulu', 'disney+', 'apple tv',
     'dstv', 'showmax', 'subscription', 'monthly plan', 'annual plan', 'membership'],
    SpendingCategory.SUBSCRIPTIONS,
  ],
  [
    ['electricity', 'water bill', 'gas bill', 'internet', 'wifi', 'broadband', 'mtn', 'airtel',
     'safaricom', 'utility', 'telco', 'vodafone', 'cable tv', 'sewerage'],
    SpendingCategory.UTILITIES,
  ],
  [
    ['rent', 'landlord', 'housing', 'apartment', 'lease', 'tenancy', 'mortgage', 'property'],
    SpendingCategory.RENT,
  ],
  [
    ['hospital', 'pharmacy', 'clinic', 'doctor', 'health', 'dental', 'optician', 'lab test',
     'medical', 'healthcare', 'polyclinic', 'dispensary', 'chemist'],
    SpendingCategory.HEALTH,
  ],
  [
    ['school', 'university', 'college', 'tuition', 'course', 'education', 'academy',
     'training', 'seminar', 'workshop', 'books', 'stationery'],
    SpendingCategory.EDUCATION,
  ],
  [
    ['hotel', 'airbnb', 'hostel', 'resort', 'travel agency', 'tourist', 'holiday', 'vacation',
     'booking.com', 'trip advisor', 'excursion', 'safari', 'visa fee'],
    SpendingCategory.TRAVEL,
  ],
  [
    ['bank transfer', 'wire transfer', 'remittance', 'send money', 'mobile money'],
    SpendingCategory.TRANSFERS,
  ],
  [
    ['salary', 'payroll', 'wage', 'dividend', 'interest earned', 'revenue', 'income', 'allowance'],
    SpendingCategory.INCOME,
  ],
  [
    ['transaction fee', 'service charge', 'commission', 'tax', 'penalty', 'fine', 'surcharge', 'levy'],
    SpendingCategory.FEES,
  ],
  [
    ['vault', 'savings deposit', 'emergency fund', 'savings plan'],
    SpendingCategory.SAVINGS,
  ],
];

const TYPE_CATEGORY_MAP: Partial<Record<TransactionType, SpendingCategory>> = {
  [TransactionType.VAULT_CONTRIBUTION]: SpendingCategory.SAVINGS,
  [TransactionType.VAULT_WITHDRAWAL]: SpendingCategory.SAVINGS,
  [TransactionType.SUBSCRIPTION_CHARGE]: SpendingCategory.SUBSCRIPTIONS,
  [TransactionType.FEE]: SpendingCategory.FEES,
  [TransactionType.P2P_TRANSFER]: SpendingCategory.TRANSFERS,
  [TransactionType.SCHEDULED_TRANSFER]: SpendingCategory.TRANSFERS,
};

@Injectable()
export class CategorizationService {
  constructor(private readonly prisma: PrismaService) {}

  categorizeByMerchant(merchantName: string | null | undefined): SpendingCategory {
    if (!merchantName) return SpendingCategory.OTHER;
    const lower = merchantName.toLowerCase();
    for (const [keywords, category] of MERCHANT_RULES) {
      if (keywords.some((k) => lower.includes(k))) return category;
    }
    return SpendingCategory.OTHER;
  }

  categorizeByType(type: TransactionType): SpendingCategory | null {
    return TYPE_CATEGORY_MAP[type] ?? null;
  }

  resolveCategory(
    type: TransactionType,
    merchantName: string | null | undefined,
    existingCategory: SpendingCategory | null | undefined,
    categorySource: string | null | undefined,
  ): SpendingCategory {
    if (existingCategory && categorySource === 'USER') return existingCategory;
    const byType = this.categorizeByType(type);
    if (byType) return byType;
    return this.categorizeByMerchant(merchantName);
  }

  async recategorizeTransaction(
    transactionId: string,
    userId: string,
    category: SpendingCategory,
  ) {
    const tx = await this.prisma.transaction.findFirst({
      where: {
        id: transactionId,
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: { category, categorySource: 'USER' },
      select: { id: true, category: true, categorySource: true, updatedAt: true },
    });
  }

  async backfillCategories(userId: string): Promise<number> {
    const uncategorized = await this.prisma.transaction.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
        category: null,
        categorySource: { not: 'USER' },
      },
      select: { id: true, type: true, merchantName: true, category: true, categorySource: true },
    });

    let updated = 0;
    for (const tx of uncategorized) {
      const inferred = this.resolveCategory(tx.type, tx.merchantName, tx.category, tx.categorySource);
      if (inferred !== SpendingCategory.OTHER || !tx.category) {
        await this.prisma.transaction.update({
          where: { id: tx.id },
          data: { category: inferred, categorySource: 'RULE' },
        });
        updated++;
      }
    }
    return updated;
  }
}
