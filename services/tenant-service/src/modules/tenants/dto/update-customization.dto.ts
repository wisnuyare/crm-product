import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateCustomizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  greeting_message: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  error_message: string;
}
