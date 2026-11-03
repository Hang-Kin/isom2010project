declare module "papaparse" {
  export type ParseError = {
    type?: string;
    code?: string;
    message: string;
    row?: number;
  };

  export type ParseResult<T> = {
    data: T[];
    errors: ParseError[];
  };

  export type ParseConfig = {
    header?: boolean;
    skipEmptyLines?: boolean | "greedy";
    dynamicTyping?: boolean;
    worker?: boolean;
  };

  export interface PapaStatic {
    parse<T>(input: string, config?: ParseConfig): ParseResult<T>;
    unparse(data: { fields: string[]; data: Array<Array<string | number | null>> }): string;
  }

  const Papa: PapaStatic;
  export default Papa;
}
