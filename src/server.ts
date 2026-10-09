import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, Prisma } from '@prisma/client';
import { z, ZodError } from 'zod';

const app = express();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET não definido. Crie o arquivo .env (veja .env.example).');
}
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? '7d') as NonNullable<jwt.SignOptions['expiresIn']>;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// ---------- Autenticação ----------

const registerSchema = z.object({
    email: z.email('E-mail inválido'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres').max(72, 'A senha deve ter no máximo 72 caracteres'),
    name: z.string().optional()
});

const loginSchema = z.object({
    email: z.email('E-mail inválido'),
    password: z.string().min(1, 'A senha é obrigatória')
});

const zodErrorResponse = (error: ZodError) => ({
    error: 'Payload inválido',
    issues: error.issues.map((e) => ({
        path: e.path.join('.'),
        message: e.message
    }))
});

const signToken = (userId: number) =>
    jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

interface AuthRequest extends Request {
    user?: { id: number; email: string; name: string | null };
}

const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Token de acesso não fornecido' });
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Formato do token inválido. Use: Bearer <token>' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as unknown as { userId: number };
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, email: true, name: true }
        });

        if (!user) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        req.user = user;
        return next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
};

app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
        const { email, password, name } = registerSchema.parse(req.body);

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(400).json({ error: 'E-mail já está em uso' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { email, password: hashedPassword, name: name ?? null }
        });

        return res.status(201).json({
            message: 'Usuário registrado com sucesso',
            token: signToken(user.id),
            user: { id: user.id, email: user.email, name: user.name }
        });
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json(zodErrorResponse(error));
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return res.status(400).json({ error: 'E-mail já está em uso' });
        }
        console.error('POST /api/auth/register error:', error);
        return res.status(500).json({ error: 'Erro interno no servidor ao registrar usuário' });
    }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const user = await prisma.user.findUnique({ where: { email } });
        // Mensagem única para e-mail inexistente ou senha errada 
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'E-mail ou senha incorretos' });
        }

        return res.status(200).json({
            message: 'Login realizado com sucesso',
            token: signToken(user.id),
            user: { id: user.id, email: user.email, name: user.name }
        });
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json(zodErrorResponse(error));
        }
        console.error('POST /api/auth/login error:', error);
        return res.status(500).json({ error: 'Erro interno no servidor ao fazer login' });
    }
});

app.get('/api/auth/me', authMiddleware, (req: AuthRequest, res: Response) => {
    return res.status(200).json({ user: req.user });
});

// ---------- Livros ----------

app.get('/', (req: Request, res: Response) => {
    res.json({ ok: true, message: 'Bem-vindo à API de Catálogo de Livros!' });
});

app.get('/api/books', async (_req: Request, res: Response) => {
    try {
        const books = await prisma.book.findMany();
        return res.status(200).json(books);
    } catch (error) {
        //console.error('GET /api/books error:', error);
        return res.status(500).json({ error: 'Erro ao buscar os livros' });
    }
});

app.get('/api/books/:id', async (req: Request, res: Response) => {
    const id = Number(req.params.id);

    if(!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID inválido' });
    }

    try {
        const book = await prisma.book.findUnique({ where: { id } });

        if(!book) {
            return res.status(404).json({ error: 'Livro não encontrado' });
        }

        return res.status(200).json(book);

    } catch (error) {
        return res.status(500).json({ error: 'Erro ao buscar livro' });
    }
});

export const createBookSchema = z.object({
    title: z.string().min(3, 'O título deve ter pelo menos 2 caracteres'),
    author: z.string().min(10, 'O author deve ter pelo menos 5 caracteres')
});

app.post('/api/books', authMiddleware, async (req: Request, res: Response) => {
    try {
        const data = createBookSchema.parse(req.body);
        const newBook = await prisma.book.create({ data });
        return res.status(201).json(newBook);
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({
                error: 'Payload inválido',
                issues: error.issues.map((e) => ({
                    path: e.path.join('.'),
                    message: e.message
                }))
            });
        }
        console.error('POST /api/books error:', error);
        return res.status(500).json({ error: 'Erro interno no servidor ao criar livro' });
    }
});

const updateBookSchema = createBookSchema.partial(); // Todos os campos são opcionais para atualização

app.put('/api/books/:id', authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if(!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID inválido' });
    }

    try{
        const data = updateBookSchema.parse(req.body);
        const updated = await prisma.book.update({ where: { id }, data });
        return res.status(200).json(updated);
    } catch (error) {
        if (error instanceof ZodError) {
            return res.status(400).json({
                error: 'Payload inválido',
                issues: error.issues.map((e) => ({
                    path: e.path.join('.'),
                    message: e.message
                }))
            });
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            return res.status(404).json({ error: 'Livro não encontrado' });
        }
        console.error('PUT /api/book/${req.params.id} error:', error);
        return res.status(500).json({ error: 'Erro interno no servidor ao atualizar livro' });
    }
});

app.delete('/api/books/:id', authMiddleware, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if(!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID inválido' });
    }

    try {
        await prisma.book.delete({ where: { id } });
        return res.status(204).send();
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            return res.status(404).json({ error: 'Livro não encontrado' });
        }
        console.error('DELETE /api/book/${req.params.id} error:', error);
        return res.status(500).json({ error: 'Erro interno no servidor ao deletar livro' });
    }
});

const PORT = 3001;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});