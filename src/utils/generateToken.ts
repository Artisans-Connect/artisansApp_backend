import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET!
const REFRESH_SECRET =  process.env.REFRESHTOKEN_SECRET!

export function generateTokens(User:any){
    const expiresIn = '1h';
    const token = jwt.sign(
            { id: User.id,
            role: User.role 
            }, 
        JWT_SECRET, 
            { expiresIn:  expiresIn});
    const new_refresh = jwt.sign(
             { id: User.id,
            role: User.role 
            },
        REFRESH_SECRET, 
            { expiresIn: "7d" });
        return {token, new_refresh, expiresIn}
};