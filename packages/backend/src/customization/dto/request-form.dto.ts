import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class RequestFormFieldDto {
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)
  name!: string;

  @IsIn(['text', 'textarea', 'number'])
  type!: 'text' | 'textarea' | 'number';

  @IsBoolean()
  required!: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  options?: string[];
}

export class CreateRequestFormDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID('4')
  folderId!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RequestFormFieldDto)
  fields!: RequestFormFieldDto[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class SubmitRequestFormDto {
  @IsObject()
  values!: Record<string, unknown>;
}

export class UpdateRequestFormPublicationDto {
  @IsBoolean()
  isPublic!: boolean;
}
