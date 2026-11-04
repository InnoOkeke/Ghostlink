<?php
// GhostLink Demo — PHP 4 Shopping Cart
// This is intentionally legacy PHP 4 style code for demonstration purposes.

// Database connection (old mysql_* API)
$db_host = "localhost";
$db_user = "shop_user";
$db_pass = "password123";
$db_name = "ecommerce";

$conn = mysql_connect($db_host, $db_user, $db_pass);
mysql_select_db($db_name, $conn);

// Global cart state (register_globals style)
$cart_items = array();
$cart_total = 0;

function get_product($product_id) {
    $sql = "SELECT * FROM products WHERE id = " . $product_id;
    $result = mysql_query($sql);
    if ($result && mysql_num_rows($result) > 0) {
        return mysql_fetch_array($result);
    }
    return false;
}

function add_to_cart($product_id, $quantity) {
    global $cart_items, $conn;
    $product = get_product($product_id);
    if (!$product) {
        return false;
    }
    // Check if already in cart
    $found = false;
    for ($i = 0; $i < count($cart_items); $i++) {
        if ($cart_items[$i]['id'] == $product_id) {
            $cart_items[$i]['qty'] += $quantity;
            $found = true;
            break;
        }
    }
    if (!$found) {
        $cart_items[] = array(
            'id'    => $product_id,
            'name'  => $product['name'],
            'price' => $product['price'],
            'qty'   => $quantity
        );
    }
    return true;
}

function remove_from_cart($product_id) {
    global $cart_items;
    $new_cart = array();
    for ($i = 0; $i < count($cart_items); $i++) {
        if ($cart_items[$i]['id'] != $product_id) {
            $new_cart[] = $cart_items[$i];
        }
    }
    $cart_items = $new_cart;
}

function calculate_total() {
    global $cart_items, $cart_total;
    $cart_total = 0;
    for ($i = 0; $i < count($cart_items); $i++) {
        $cart_total += $cart_items[$i]['price'] * $cart_items[$i]['qty'];
    }
    // Apply 10% discount if total > 100
    if ($cart_total > 100) {
        $cart_total = $cart_total * 0.9;
    }
    return $cart_total;
}

function process_order($customer_name, $customer_email, $address) {
    global $cart_items, $conn;
    if (count($cart_items) == 0) {
        return false;
    }
    $total = calculate_total();
    // Insert order (vulnerable to SQL injection — intentional demo)
    $sql = "INSERT INTO orders (customer_name, customer_email, address, total, created_at) "
         . "VALUES ('" . $customer_name . "', '" . $customer_email . "', '" . $address . "', " . $total . ", NOW())";
    $result = mysql_query($sql, $conn);
    if (!$result) {
        return false;
    }
    $order_id = mysql_insert_id($conn);
    // Insert order items
    for ($i = 0; $i < count($cart_items); $i++) {
        $item_sql = "INSERT INTO order_items (order_id, product_id, quantity, price) "
                  . "VALUES (" . $order_id . ", " . $cart_items[$i]['id'] . ", "
                  . $cart_items[$i]['qty'] . ", " . $cart_items[$i]['price'] . ")";
        mysql_query($item_sql, $conn);
    }
    // Clear cart after successful order
    $cart_items = array();
    $cart_total = 0;
    return $order_id;
}

function display_cart() {
    global $cart_items;
    if (count($cart_items) == 0) {
        echo "<p>Your cart is empty.</p>";
        return;
    }
    echo "<table border='1'>";
    echo "<tr><th>Product</th><th>Price</th><th>Qty</th><th>Subtotal</th></tr>";
    for ($i = 0; $i < count($cart_items); $i++) {
        $subtotal = $cart_items[$i]['price'] * $cart_items[$i]['qty'];
        echo "<tr>";
        echo "<td>" . $cart_items[$i]['name'] . "</td>";
        echo "<td>$" . $cart_items[$i]['price'] . "</td>";
        echo "<td>" . $cart_items[$i]['qty'] . "</td>";
        echo "<td>$" . $subtotal . "</td>";
        echo "</tr>";
    }
    echo "<tr><td colspan='3'><strong>Total</strong></td><td>$" . calculate_total() . "</td></tr>";
    echo "</table>";
}
?>
