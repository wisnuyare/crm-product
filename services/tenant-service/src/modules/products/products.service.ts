import { Injectable, NotFoundException, Logger, InternalServerErrorException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

// Product entity interface
export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  category?: string | null;
  sku?: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProductSearchResult {
  product: Product | null;
  suggestions?: Product[];
  message?: string;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Fuzzy search for products - calculates similarity score
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // Exact match
    if (s1 === s2) return 1.0;

    // Contains match
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;

    // Levenshtein distance for fuzzy matching
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Search for product by name with fuzzy matching and suggestions
   */
  async searchByName(
    tenantId: string,
    productName: string,
    minSimilarity: number = 0.6,
  ): Promise<ProductSearchResult> {
    try {
      // Try exact match first (case-insensitive)
      const exactMatch = await this.db.queryOne<Product>(
        `SELECT * FROM products
         WHERE tenant_id = $1
         AND LOWER(name) = LOWER($2)
         AND status = 'active'`,
        [tenantId, productName],
      );

      if (exactMatch) {
        this.logger.log(`Exact match found for "${productName}"`);
        return { product: exactMatch };
      }

      // If no exact match, find all active products and calculate similarity
      const allProducts = await this.db.queryMany<Product>(
        `SELECT * FROM products
         WHERE tenant_id = $1
         AND status = 'active'`,
        [tenantId],
      );

      const scoredProducts = allProducts
        .map((product) => ({
          product,
          similarity: this.calculateSimilarity(product.name, productName),
        }))
        .filter((item) => item.similarity >= minSimilarity)
        .sort((a, b) => b.similarity - a.similarity);

      if (scoredProducts.length > 0 && scoredProducts[0].similarity >= 0.7) {
        // Close match (including substring matches), return it as the product
        this.logger.log(
          `Close match found for "${productName}": "${scoredProducts[0].product.name}" (similarity: ${scoredProducts[0].similarity})`,
        );
        return {
          product: scoredProducts[0].product,
          suggestions: scoredProducts.slice(1, 4).map((item) => item.product),
        };
      }

      // No close match, return suggestions
      const suggestions = scoredProducts.slice(0, 5).map((item) => item.product);

      if (suggestions.length > 0) {
        this.logger.log(
          `No exact match for "${productName}", returning ${suggestions.length} suggestions`,
        );
        return {
          product: null,
          suggestions,
          message: `Product "${productName}" not found. Did you mean one of these?`,
        };
      }

      // No matches at all
      this.logger.log(`No matches found for "${productName}"`);
      return {
        product: null,
        suggestions: [],
        message: `Product "${productName}" not found`,
      };
    } catch (error) {
      this.logger.error(`Error searching for product "${productName}":`, error);
      throw new InternalServerErrorException('Failed to search for product');
    }
  }

  /**
   * Get all products for a tenant with optional filters
   */
  async findAll(
    tenantId: string,
    filters?: { category?: string; status?: string; search?: string },
  ): Promise<Product[]> {
    let query = 'SELECT * FROM products WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.category) {
      query += ` AND category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    if (filters?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.search) {
      query += ` AND LOWER(name) LIKE LOWER($${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    return await this.db.queryMany<Product>(query, params);
  }

  /**
   * Get product by ID
   */
  async findOne(tenantId: string, id: string): Promise<Product> {
    const product = await this.db.queryOne<Product>(
      'SELECT * FROM products WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  /**
   * Create a new product
   */
  async create(tenantId: string, createProductDto: CreateProductDto): Promise<Product> {
    const product = await this.db.queryOne<Product>(
      `INSERT INTO products (
        tenant_id, name, description, price, stock_quantity,
        low_stock_threshold, category, sku, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
      RETURNING *`,
      [
        tenantId,
        createProductDto.name,
        createProductDto.description || null,
        createProductDto.price,
        createProductDto.stock_quantity,
        createProductDto.low_stock_threshold || 10,
        createProductDto.category || null,
        createProductDto.sku || null,
      ],
    );

    return product!;
  }

  /**
   * Update a product
   */
  async update(
    tenantId: string,
    id: string,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    // First check if product exists
    await this.findOne(tenantId, id);

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updateProductDto.name !== undefined) {
      fields.push(`name = $${paramIndex}`);
      values.push(updateProductDto.name);
      paramIndex++;
    }

    if (updateProductDto.description !== undefined) {
      fields.push(`description = $${paramIndex}`);
      values.push(updateProductDto.description);
      paramIndex++;
    }

    if (updateProductDto.price !== undefined) {
      fields.push(`price = $${paramIndex}`);
      values.push(updateProductDto.price);
      paramIndex++;
    }

    if (updateProductDto.stock_quantity !== undefined) {
      fields.push(`stock_quantity = $${paramIndex}`);
      values.push(updateProductDto.stock_quantity);
      paramIndex++;
    }

    if (updateProductDto.low_stock_threshold !== undefined) {
      fields.push(`low_stock_threshold = $${paramIndex}`);
      values.push(updateProductDto.low_stock_threshold);
      paramIndex++;
    }

    if (updateProductDto.category !== undefined) {
      fields.push(`category = $${paramIndex}`);
      values.push(updateProductDto.category);
      paramIndex++;
    }

    if (updateProductDto.sku !== undefined) {
      fields.push(`sku = $${paramIndex}`);
      values.push(updateProductDto.sku);
      paramIndex++;
    }

    fields.push(`updated_at = NOW()`);

    values.push(id, tenantId);

    const product = await this.db.queryOne<Product>(
      `UPDATE products
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING *`,
      values,
    );

    return product!;
  }

  /**
   * Delete a product (soft delete by setting status to inactive)
   */
  async remove(tenantId: string, id: string): Promise<void> {
    const product = await this.findOne(tenantId, id);

    await this.db.queryOne(
      `UPDATE products
       SET status = 'inactive', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
  }
}
