<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Bobcats</title>
<meta http-equiv="content-type" content="text/html; charset=iso-8859-1" />
<link rel="stylesheet" type="text/css" href="css/main.css" />
<script type="text/javascript" src="js/main.js"></script>
</head>
<body class="mainBody" onLoad="setPastGamesDisplayPref('pastGamesOnGamesPage')">

<div id="container">
  <div id="mainContent">
    <div class="style1">
    <h1>Manage Games</h1>


<p class="link-row"><span class ="style1"><a href="index.php">home</a> | <a href="players.php">manage roster</a> | <a href="games.php">manage games</a></p>


<?php 

error_reporting(E_ALL);
ini_set('display_errors', true);

$dbcnx = @mysql_connect('mysql50-36.wc1.dfw1.stabletransit.com', '496492_th', 'Krul6666');
if (!$dbcnx) {
	exit ('<p>Unable to connect to the database server at this time.</p>');
	
}

if (!@mysql_select_db('496492_turtlemaster')) {
	exit('<p>Unable to locate the database at this time.</p>');
}

// Check to see whether the user has clicked on the "show past games" or "hide past games"
// links from this page, and set the $show_past_games variable accordingly.  Default is FALSE for this page.
// Then display the appropriate link (the one which will toggle the current status).


?>

<p><span class ="style1"><a href="#" id="togglePastGamesID" onClick="togglePastGames('pastGamesOnGamesPage')">Show past games</a></span></p>

<?php

// Display each game (except ones in the past if show_past_games is false.)

$games = @mysql_query('SELECT id, name, unixtimestamp ' .
						'FROM bobcats_game ORDER BY unixtimestamp ASC');
if (!$games) {
	exit('<p>Error retrieving games from database!<br />' .
		'Error: ' . mysql_error() . '</p>');
}






$this_is_the_first_past_game = TRUE;
$this_is_the_first_future_game = TRUE;
$this_game_is_in_the_future = FALSE;
echo ('<div id="pastGames" class="hiding">');
while ($game = mysql_fetch_array($games)) {
    $this_game_is_in_the_future = ($game['unixtimestamp'] > time());
    if ($this_is_the_first_past_game AND !$this_game_is_in_the_future) { 
   		echo '<p><span class="style1"><strong>Past games:</strong></span></p>';
   		$this_is_the_first_past_game = FALSE;  // toggle this_is_the_first_past_game off
   	}
   	else if ($this_is_the_first_future_game AND $this_game_is_in_the_future) {
   		// If there were no past games, then this_is_the_first_past_game never got turned off
   		if ($this_is_the_first_past_game) { 
   			echo '<p><span class="style1"><strong>No past games.</strong></span></p>';
   			// We don't need to turn off $this_is_the_first_past_game because it'll never be checked again now 
   			// that $this_game_is_in_the_future is true.
   		}
   		echo '</div>';
   		echo '<p><span class ="style1"><strong>Future games:</strong></span></p>';
   		$this_is_the_first_future_game = FALSE;
   	}
		$id = $game['id'];
		$game_name = htmlspecialchars($game['name']);
		$game_date = date('l, F j, Y', $game['unixtimestamp']);   // Friday, January 7, 2010
		$game_time = date('g:i a', $game['unixtimestamp']);   // 7:08 am
		echo "<p class=\"list1\">$game_name on $game_date at $game_time " .
			"<a href='editgame.php?id=$id'>Edit</a> " .
			"<a href='deletegame.php?id=$id'>Delete</a></p>";
}
// If there were no future games, 
// $this_game_is_in_the_future will never have been set to true.  In that case,
// this if statement needs to be executed so we can close the div tag.
if (!$this_game_is_in_the_future) {
    echo '</div>';
}
    

?>

<br />
<p><a href="editgame.php">Add new game</a></p>
<br />

</body>




</div>
</div>
</div>
</body>
</html>