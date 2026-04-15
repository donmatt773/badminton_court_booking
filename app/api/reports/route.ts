import { NextRequest, NextResponse } from 'next/server';

// In-memory store for demonstration (replace with DB in production)
let reports: Array<{ id: number; customer: string; message: string; createdAt: string }> = [];

export async function GET() {
  // Return all reports
  return NextResponse.json(reports);
}

export async function POST(req: NextRequest) {
  const { customer, message } = await req.json();
  if (!customer || !message) {
    return NextResponse.json({ error: 'Missing customer or message' }, { status: 400 });
  }
  const report = {
    id: reports.length + 1,
    customer,
    message,
    createdAt: new Date().toISOString(),
  };
  reports.push(report);
  return NextResponse.json(report, { status: 201 });
}
