import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
    console.log('--- Categories in DB ---');
    const categories = await prisma.category.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
    });
    console.table(categories.map(c => ({ id: c.id, name: `"${c.name}"`, order: c.order, isActive: c.isActive })));

    console.log('\n--- Distinct Categories in Events ---');
    const eventCategories = await prisma.event.groupBy({
        by: ['category'],
        _count: {
            _all: true,
        },
    });
    console.table(eventCategories.map(ec => ({ category: `"${ec.category}"`, count: ec._count._all })));

    console.log('\n--- Active Events with Future Dates per Category (Matches current logic) ---');
    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);

    const results: any[] = [];
    for (const cat of categories) {
        const count = await prisma.event.count({
            where: {
                isActive: true,
                category: cat.name,
                dates: { some: { date: { gte: todayUTC } } },
            },
        });
        results.push({ category: cat.name, activeFutureCount: count });
    }
    console.table(results);

    console.log('\n--- Active Events (Any Date) per Category ---');
    const resultsAnyDate: any[] = [];
    for (const cat of categories) {
        const count = await prisma.event.count({
            where: {
                isActive: true,
                category: cat.name,
            },
        });
        resultsAnyDate.push({ category: cat.name, activeAnyDateCount: count });
    }
    console.table(resultsAnyDate);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
