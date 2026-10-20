import { SalesforceData } from '../models/index';

export interface YearlyFinancials {
  year: number;
  sales: number;
  profit: number;
}

// Returns every year on record for the company, oldest first, so the LLM can
// see the trend and not just the latest year.
export const getCompanyFinancials = async (
  companyId: string
): Promise<YearlyFinancials[]> => {
  const rows = await SalesforceData.findAll({
    where: { companyId },
    order: [['year', 'ASC']],
  });

  // Postgres NUMERIC comes back from Sequelize as a string, despite the model
  // typing it as number, so convert explicitly.
  return rows.map((row) => ({
    year: row.year,
    sales: Number(row.sales),
    profit: Number(row.profit),
  }));
};
