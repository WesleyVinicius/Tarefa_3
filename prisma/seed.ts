import "dotenv/config";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Iniciando...");

    await prisma.book.deleteMany();

    await prisma.book.createMany({
        data: [
            {
                title: "Dom Casmurro",
                author: "Machado de Assis"
            },
            {
                title: "Mar Morto",
                author: "Jorge Amado"
            },
            {
                title: "O Quinze",
                author: "Rachel de Queiroz"
            },
            {
                title: "O Cortiço",
                author: "Aluísio Azevedo"
            },
            {
                title: "Os Sertões",
                author: "Euclides da Cunha"
            }
        ]
    });

    const count = await prisma.book.count();
    console.log(`Foram inseridos ${count} livros no banco de dados.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });