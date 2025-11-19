import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Public } from '../../decorators/public.decorator';

@ApiTags('products')
@ApiBearerAuth()
@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * Search for products by name with fuzzy matching
   * Used by LLM agents for product lookups with suggestions
   * @Public - No auth required for internal service-to-service calls
   */
  @Public()
  @Get('outlets/:outletId/products/search')
  @ApiOperation({ summary: 'Search products by name with fuzzy matching and suggestions' })
  @ApiResponse({ status: 200, description: 'Product search results with suggestions' })
  async searchProducts(
    @Headers('x-tenant-id') tenantId: string,
    @Param('outletId') outletId: string,
    @Query('name') productName: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header is required');
    }

    if (!productName) {
      throw new BadRequestException('Product name query parameter is required');
    }

    const result = await this.productsService.searchByName(tenantId, productName);

    // Return structured response for LLM consumption
    return {
      exact_match: result.product !== null,
      product: result.product,
      suggestions: result.suggestions || [],
      message: result.message,
    };
  }

  /**
   * Get all products for a tenant with optional filters
   */
  @Get('products')
  @ApiOperation({ summary: 'Get all products with optional filters' })
  @ApiResponse({ status: 200, description: 'List of products' })
  async findAll(
    @Headers('x-tenant-id') tenantId: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header is required');
    }

    const products = await this.productsService.findAll(tenantId, {
      category,
      status,
      search,
    });

    return { products };
  }

  /**
   * Get a single product by ID
   */
  @Get('products/:id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product details' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findOne(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header is required');
    }

    const product = await this.productsService.findOne(tenantId, id);
    return { product };
  }

  /**
   * Create a new product
   */
  @Post('products')
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid product data' })
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @Body() createProductDto: CreateProductDto,
  ) {
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header is required');
    }

    const product = await this.productsService.create(tenantId, createProductDto);
    return { product };
  }

  /**
   * Update an existing product
   */
  @Put('products/:id')
  @ApiOperation({ summary: 'Update a product' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async update(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header is required');
    }

    const product = await this.productsService.update(tenantId, id, updateProductDto);
    return { product };
  }

  /**
   * Delete a product (soft delete)
   */
  @Delete('products/:id')
  @ApiOperation({ summary: 'Delete a product (soft delete)' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async remove(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header is required');
    }

    await this.productsService.remove(tenantId, id);
    return { message: 'Product deleted successfully' };
  }
}
