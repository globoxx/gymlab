import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { compare } from "bcrypt";


export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    secret: process.env.NEXTAUTH_SECRET,
    session: {
        strategy: "jwt",
    },
    pages: {
        signIn: "/sign-in",
    },
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email", placeholder: "john.doe@eduvaud.ch" },
                password: { label: "Password", type: "password" }
            },
            /**
             * Authenticates a user based on provided credentials.
             *
             * @param credentials - An object containing the user's email and password.
             * @returns The authenticated user's data (id, email, firstName, lastName, role, grades) if authentication is successful; otherwise, returns null.
             *
             * @remarks
             * - Returns null if credentials are missing, the user does not exist, or the password does not match.
             * - Uses Prisma to query the user and bcrypt's compare function to validate the password.
             */
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    return null
                }

                const existingUser = await prisma.user.findUnique({
                    where: {
                        email: credentials.email
                    }
                })

                if (!existingUser) {
                    return null
                }

                const passwordMatch = await compare(credentials.password, existingUser.password)
                if (!passwordMatch) {
                    return null
                }

                return {
                    id: existingUser.id,
                    email: existingUser.email,
                    firstName: existingUser.firstName,
                    lastName: existingUser.lastName,
                    role: existingUser.role,
                    grades: existingUser.grades,
                }
            }
        })
    ],
    callbacks: {
        /**
         * JWT callback for NextAuth.js.
         *
         * This function is called whenever a JSON Web Token (JWT) is created or updated.
         * If a `user` object is present (typically during sign-in), it merges user properties
         * such as `id`, `firstName`, `lastName`, `role`, and `grades` into the token.
         * Otherwise, it returns the existing token unchanged.
         *
         * @param token - The current JWT token object.
         * @param user - The user object, present on sign-in.
         * @returns The updated token object with user properties if user is present, otherwise the original token.
         */
        async jwt({ token, user }) {
            console.log("JWT callback - user:", user);
            if (user) {
                return {
                    ...token,
                    id: user.id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    grades: user.grades
                }
            }
            return token
        },
        /**
         * Enhances the session object by merging additional user properties from the token.
         *
         * @param session - The current session object.
         * @param token - The token containing user information such as id, firstName, lastName, role, and grades.
         * @returns A new session object with extended user properties from the token.
         */
        async session({ session, token }) {
            console.log("Session callback - token:", token);
            return {
                ...session,
                user: {
                    ...session.user,
                    id: token.id,
                    firstName: token.firstName,
                    lastName: token.lastName,
                    role: token.role,
                    grades: token.grades
                }
            }
        }
    }
}