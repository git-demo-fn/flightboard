<?php

declare(strict_types=1);

namespace Flightboard\Pay\Tests;

use Flightboard\Pay\App;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class AppTest extends TestCase
{
    public function testHealth(): void
    {
        [$status, $body] = (new App())->handle('GET', '/health', '');

        self::assertSame(200, $status);
        self::assertSame(['status' => 'ok'], $body);
    }

    public function testQuote(): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', '{"type":"Fixed","rate":180}');

        self::assertSame(200, $status);
        self::assertSame([
            'type' => 'Fixed',
            'lines' => [['label' => 'Labor - Fixed pay', 'amount' => 180.0]],
            'total' => 180.0,
        ], $body);
    }

    public function testQuoteWithTwoExpenses(): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', json_encode([
            'type' => 'Hourly',
            'rate' => 65,
            'hours' => 4,
            'expenses' => [
                ['category' => 'Parts', 'amountCents' => 4599],
                ['category' => 'Travel', 'amountCents' => 1250],
            ],
        ], JSON_THROW_ON_ERROR));

        self::assertSame(200, $status);
        self::assertSame([
            'type' => 'Hourly',
            'lines' => [
                ['label' => 'Labor - Hourly pay (4 hr x $65.00)', 'amount' => 260.0],
                ['label' => 'Expense - Parts', 'amount' => 45.99],
                ['label' => 'Expense - Travel', 'amount' => 12.5],
            ],
            'total' => 318.49,
        ], $body);
    }

    public function testQuoteWithEmptyExpenses(): void
    {
        $app = new App();

        self::assertSame(
            $app->handle('POST', '/quote', '{"type":"Fixed","rate":180}'),
            $app->handle('POST', '/quote', '{"type":"Fixed","rate":180,"expenses":[]}'),
        );
    }

    public function testQuoteWithWholeDollarExpense(): void
    {
        [$status, $body] = (new App())->handle(
            'POST',
            '/quote',
            '{"type":"Fixed","rate":180,"expenses":[{"category":"Parts","amountCents":100}]}',
        );

        self::assertSame(200, $status);
        self::assertSame(['label' => 'Expense - Parts', 'amount' => 1.0], $body['lines'][1]);
        self::assertSame(181.0, $body['total']);
    }

    /** @return array<string, array{0: mixed, 1: string}> */
    public static function invalidExpenses(): array
    {
        $categoryError = 'expense category must be a non-empty string';
        $amountError = 'expense amountCents must be a positive whole number';

        return [
            'missing category' => [[['amountCents' => 4599]], $categoryError],
            'empty category' => [[['category' => '', 'amountCents' => 4599]], $categoryError],
            'blank category' => [[['category' => ' ', 'amountCents' => 4599]], $categoryError],
            'non-string category' => [[['category' => 1, 'amountCents' => 4599]], $categoryError],
            'non-object entry' => [[null], $categoryError],
            'missing amount' => [[['category' => 'Parts']], $amountError],
            'zero amount' => [[['category' => 'Parts', 'amountCents' => 0]], $amountError],
            'negative amount' => [[['category' => 'Parts', 'amountCents' => -1]], $amountError],
            'fractional amount' => [[['category' => 'Parts', 'amountCents' => 45.99]], $amountError],
            'string amount' => [[['category' => 'Parts', 'amountCents' => '4599']], $amountError],
            'boolean amount' => [[['category' => 'Parts', 'amountCents' => true]], $amountError],
            'null expenses' => [null, 'expenses must be a list'],
            'string expenses' => ['Parts', 'expenses must be a list'],
            'object expenses' => [['category' => 'Parts', 'amountCents' => 4599], 'expenses must be a list'],
        ];
    }

    #[DataProvider('invalidExpenses')]
    public function testQuoteWithInvalidExpenses(mixed $expenses, string $error): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', json_encode([
            'type' => 'Fixed',
            'rate' => 180,
            'expenses' => $expenses,
        ], JSON_THROW_ON_ERROR));

        self::assertSame(400, $status);
        self::assertSame(['error' => $error], $body);
    }

    public function testQuoteWithInvalidJson(): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', '{oops');

        self::assertSame(400, $status);
        self::assertSame('invalid JSON body', $body['error']);
    }

    public function testQuoteWithInvalidPay(): void
    {
        [$status] = (new App())->handle('POST', '/quote', '{"type":"Hourly","rate":10}');

        self::assertSame(400, $status);
    }

    public function testQuoteWithUnsupportedType(): void
    {
        [$status, $body] = (new App())->handle('POST', '/quote', '{"type":"Blended","rate":10}');

        self::assertSame(422, $status);
        self::assertStringContainsString('Blended', $body['error']);
    }

    public function testQuoteWithUnsupportedTypeAndExpenses(): void
    {
        [$status, $body] = (new App())->handle(
            'POST',
            '/quote',
            '{"type":"Blended","rate":10,"expenses":[{"category":"Parts","amountCents":4599}]}',
        );

        self::assertSame(422, $status);
        self::assertSame(['error' => 'Blended pay is not supported yet'], $body);
    }

    public function testUnknownRoute(): void
    {
        [$status] = (new App())->handle('GET', '/nope', '');

        self::assertSame(404, $status);
    }
}
