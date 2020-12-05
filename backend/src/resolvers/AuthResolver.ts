import {
  Arg,
  Ctx,
  Field,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from "type-graphql";
import { User } from "../entities/User";
import { MeResponse, SignUpResponse } from "../types/Responses";
import { MyContext, Upload } from "../types";
import { createWriteStream } from "fs";
import { GraphQLUpload } from "graphql-upload";
import argon2 from "argon2";
import { toProfilePath } from "../constants";
import { extension } from "../utils/fileExtension";
import { validateImage } from "../utils/validateImage";
import { SingInInput, SingUpInput } from "../types/Inputs";
import { saveFile } from "../utils/saveFile";

@Resolver()
export class Auth {
  @Query(() => String)
  hello() {
    return "World";
  }

  @Query(() => MeResponse, { nullable: true })
  async me(@Ctx() { req }: MyContext): Promise<MeResponse | null> {
    if (!req.session.userId) return null;
    const user = await User.findOne(req.session.userId);
    if (!user) return null;
    Reflect.deleteProperty(user, "password");
    return user;
  }

  @Query(() => User, { nullable: true })
  async user(
    @Arg("username", { nullable: true }) username: string
  ): Promise<Partial<User> | null> {
    if (!username) return null;
    const user = await User.findOne({ where: { username } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      backgroundPicture: user.backgroundPicture,
      about: user.about,
      name: user.name,
      picture: user.picture,
      username: user.username,
      age: user.age,
    };
  }

  @Mutation(() => SignUpResponse)
  async signUp(
    @Arg("fields") fields: SingUpInput,
    @Arg("profile_picture", () => GraphQLUpload, { nullable: true })
    picture: Upload
  ): Promise<SignUpResponse> {
    const errors = new SingUpInput(fields).validate();
    if (errors.length > 0) {
      return {
        message: "Bad inputs",
        errors,
        success: false,
      };
    }

    const existingUser = await User.findOne({
      where: [{ username: fields.username, email: fields.email }],
    });

    if (existingUser) {
      return {
        message: "You already have been registered",
        success: false,
      };
    }

    const hashPassword = await argon2.hash(fields.password);

    const user = await User.create({
      ...fields,
      password: hashPassword,
    });

    if (picture) {
      const isValidImage = await validateImage(picture);
      if (!isValidImage)
        return {
          message: "Cannot upload your profile photo.",
          success: false,
        };

      const { success, message, url } = await saveFile({
        file: picture,
        fileKind: "profile-pictures",
        fileName: fields.username,
        saveTo: toProfilePath,
      });
      if (!success) {
        return {
          message,
          success: false,
        };
      }
      user.picture = url as string;
    }

    await user.save();

    return { success: true };
  }

  @Mutation(() => MeResponse)
  async logIn(
    @Arg("fields") fields: SingInInput,
    @Ctx() { req }: MyContext
  ): Promise<MeResponse> {
    const errors = new SingInInput(fields).validate();
    if (errors.length > 0) {
      return {
        errors,
        message: "Validation errors",
      };
    }

    const user = await User.findOne({ where: { email: fields.email } });

    if (!user)
      return {
        message: "No user found",
        success: false,
      };

    const password = await argon2.verify(user.password, fields.password);
    if (!password)
      return {
        message: "Invalid credentials",
        success: false,
      };

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.picture = user.picture;
    req.session.bgPicture = user.backgroundPicture;

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      picture: user.picture,
      success: true,
      age: user.age,
      name: user.name,
      about: user.about,
      backgroundPicture: user.backgroundPicture,
    };
  }

  @Mutation(() => Boolean)
  logout(@Ctx() { req }: MyContext) {
    req.session.destroy(() => {});
    return true;
  }
}
